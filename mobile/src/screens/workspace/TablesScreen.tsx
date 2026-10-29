import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { DishGrid } from '../../components/workspace/DishGrid';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { Stepper } from '../../components/workspace/Stepper';
import { ApiError } from '../../api/client';
import { useResource } from '../../api/cache';
import { listCategories, listDishes } from '../../api/workspace/menu';
import type { Category, Dish } from '../../api/workspace/menu';
import {
  billName,
  cancelBill,
  cancelBillItem,
  createTable,
  createTablesBatch,
  deleteTable,
  fetchKitchenSettings,
  getBill,
  ITEM_STATUS_LABELS,
  listTables,
  markItemServed,
  openBill,
  requestBill,
  sendToKitchen,
  TABLE_STATE_LABELS,
  updateKitchenSettings,
} from '../../api/workspace/tables';
import type { Bill, BillItem, DiningTable, ItemStatus, TableState } from '../../api/workspace/tables';
import { formatTime } from '../../utils/date';
import { parseAmount } from '../../utils/money';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, shadows, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

/** Le plan se rafraîchit seul : la cuisine et la caisse le font bouger. */
const POLL_MS = 10_000;

const STATE_TONES: Record<TableState, { color: string; background: string }> = {
  free: { color: colors.textTertiary, background: colors.surface },
  occupied: { color: colors.iconBlue, background: colors.pastelBlue },
  cooking: { color: colors.iconAmber, background: colors.pastelAmber },
  ready: { color: colors.iconGreen, background: colors.pastelGreen },
  bill: { color: colors.iconRed, background: colors.pastelRed },
};

const ITEM_TONES: Record<ItemStatus, string> = {
  sent: colors.iconAmber,
  preparing: colors.iconAmber,
  ready: colors.iconGreen,
  served: colors.textTertiary,
  cancelled: colors.textTertiary,
};

/**
 * Service en salle, côté serveur.
 *
 * Le plan des tables montre d'un coup d'œil où en est chacune. Une table
 * peut avoir plusieurs additions : des clients qui ne sont pas ensemble
 * paient chacun la leur. Le serveur envoie en cuisine, sert ce qui est
 * prêt, puis demande l'addition : le caissier encaisse.
 */
export function TablesScreen() {
  const { can, money, notifications } = useWorkspace();
  const [tables, setTables] = useState<DiningTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [area, setArea] = useState('all');
  const [picked, setPicked] = useState<DiningTable | null>(null);
  const [opening, setOpening] = useState<DiningTable | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setTables(await listTables());
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des tables impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Un plat prêt, une addition payée : le plan suit aussitôt.
  const latestId = notifications[0]?.id;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load();
  }, [latestId, load]);

  if (billId) {
    return (
      <BillView
        billId={billId}
        onBack={() => {
          setBillId(null);
          void load();
        }}
      />
    );
  }

  if (error && !tables) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!tables) return <LoadingState label="Chargement des tables…" />;

  const areas = [...new Set(tables.map((table) => table.area).filter((value): value is string => Boolean(value)))];
  const visible = area === 'all' ? tables : tables.filter((table) => table.area === area);

  function pick(table: DiningTable) {
    if (table.bills.length === 0) setOpening(table);
    else setPicked(table);
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={colors.primary}
          />
        }
      >
        {tables.length === 0 ? (
          <EmptyState
            icon="grid"
            title="Aucune table"
            message={
              can('settings.manage')
                ? 'Créez vos tables : en une fois, « Table 1 » à « Table 12 ».'
                : 'Le gérant n’a pas encore créé les tables de la salle.'
            }
            action={can('settings.manage') ? <Button label="Créer mes tables" onPress={() => setManageOpen(true)} /> : undefined}
          />
        ) : (
          <>
            <View style={styles.legend}>
              {(Object.keys(TABLE_STATE_LABELS) as TableState[]).map((state) => (
                <View key={state} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: STATE_TONES[state].color }]} />
                  <Text style={styles.legendText}>{TABLE_STATE_LABELS[state]}</Text>
                </View>
              ))}
            </View>

            {areas.length > 1 && (
              <View style={styles.filters}>
                <Chips
                  bleed={screenPadding}
                  options={[{ value: 'all', label: 'Toute la salle' }, ...areas.map((value) => ({ value, label: value }))]}
                  value={area}
                  onChange={setArea}
                />
              </View>
            )}

            <View style={styles.grid}>
              {visible.map((table) => {
                const tone = STATE_TONES[table.state];
                const total = table.bills.reduce((sum, bill) => sum + bill.total, 0);
                return (
                  <Pressable
                    key={table.id}
                    onPress={() => pick(table)}
                    accessibilityRole="button"
                    accessibilityLabel={`${table.name} : ${TABLE_STATE_LABELS[table.state]}`}
                    style={({ pressed }) => [
                      styles.tile,
                      { backgroundColor: tone.background, borderColor: table.state === 'free' ? colors.border : tone.color },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.tileName} numberOfLines={1}>
                      {table.name}
                    </Text>
                    <Text style={[styles.tileState, { color: tone.color }]} numberOfLines={1}>
                      {TABLE_STATE_LABELS[table.state]}
                    </Text>
                    {table.bills.length > 0 && (
                      <Text style={styles.tileMeta} numberOfLines={1}>
                        {table.bills.length > 1 ? `${table.bills.length} additions · ` : ''}
                        {money(total)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {can('settings.manage') && (
              <Pressable onPress={() => setManageOpen(true)} style={styles.manage} accessibilityRole="button">
                <Icon name="settings" size={15} color={colors.primary} />
                <Text style={styles.manageText}>Gérer les tables et la cuisine</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <Sheet
        visible={Boolean(picked)}
        title={picked?.name ?? ''}
        subtitle={picked ? TABLE_STATE_LABELS[picked.state] : undefined}
        onClose={() => setPicked(null)}
        actions={
          picked ? (
            <Button
              label="Nouvelle addition (autres clients)"
              onPress={() => {
                setOpening(picked);
                setPicked(null);
              }}
              variant="secondary"
            />
          ) : undefined
        }
      >
        {picked?.bills.map((bill, index) => (
          <View key={bill.id}>
            {index > 0 && <RowDivider />}
            <ListRow
              icon="receipt"
              iconColor={bill.status === 'bill_requested' ? colors.iconRed : colors.iconBlue}
              iconBackground={bill.status === 'bill_requested' ? colors.pastelRed : colors.pastelBlue}
              title={billName(bill)}
              subtitle={`${bill.guests} couvert(s) · ${bill.waiterName ?? '—'} · depuis ${formatTime(bill.openedAt)}`}
              value={money(bill.total)}
              valueCaption={bill.status === 'bill_requested' ? 'Addition demandée' : undefined}
              onPress={() => {
                setPicked(null);
                setBillId(bill.id);
              }}
            />
          </View>
        ))}
      </Sheet>

      <OpenBillSheet
        table={opening}
        onClose={() => setOpening(null)}
        onOpened={(bill) => {
          setOpening(null);
          setBillId(bill.id);
        }}
      />

      <ManageSheet
        visible={manageOpen}
        tables={tables}
        onClose={() => setManageOpen(false)}
        onChanged={() => void load()}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Nouvelle addition
// ---------------------------------------------------------------------------

function OpenBillSheet({
  table,
  onClose,
  onOpened,
}: {
  table: DiningTable | null;
  onClose: () => void;
  onOpened: (bill: Bill) => void;
}) {
  const [label, setLabel] = useState('');
  const [guests, setGuests] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!table) return;
    setLabel('');
    setGuests(1);
    setError(null);
  }, [table]);

  async function submit() {
    if (!table) return;
    setBusy(true);
    setError(null);
    try {
      onOpened(await openBill(table.id, { label: label.trim() || null, guests }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Ouverture impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={Boolean(table)}
      title={`Nouvelle addition · ${table?.name ?? ''}`}
      error={error}
      onClose={onClose}
      actions={<Button label="Ouvrir et prendre la commande" onPress={() => void submit()} loading={busy} />}
    >
      <Field
        label="Nom de l’addition (facultatif)"
        value={label}
        onChangeText={setLabel}
        placeholder="Monsieur en chemise bleue, Groupe de 4…"
        hint="Utile quand plusieurs clients qui ne sont pas ensemble partagent la table."
      />
      <View style={styles.guests}>
        <Text style={styles.blockLabel}>Couverts</Text>
        <Stepper value={guests} onChange={setGuests} min={1} max={99} />
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Une addition : ce qui est envoyé, prêt, servi ; ajouter des plats
// ---------------------------------------------------------------------------

interface CartLine {
  dish: Dish;
  quantity: number;
  note: string;
}

function BillView({ billId, onBack }: { billId: string; onBack: () => void }) {
  const { can, money, notify, notifications } = useWorkspace();
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState('all');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelItem, setCancelItem] = useState<BillItem | null>(null);
  const [cancelAll, setCancelAll] = useState(false);

  const menu = useResource<{ categories: Category[]; dishes: Dish[] }>('menu:list', async () => {
    const [categories, dishes] = await Promise.all([listCategories(), listDishes()]);
    return { categories, dishes };
  });

  const load = useCallback(async () => {
    try {
      setBill(await getBill(billId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement de l’addition impossible.');
    }
  }, [billId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const latestId = notifications[0]?.id;
  useEffect(() => {
    void load();
  }, [latestId, load]);

  const counts = useMemo(
    () => Object.fromEntries(cart.map((line) => [line.dish.id, line.quantity])),
    [cart],
  );

  async function run(action: () => Promise<Bill>, message: string) {
    setBusy(true);
    setActionError(null);
    try {
      setBill(await action());
      notify(message);
      return true;
    } catch (cause) {
      const text = cause instanceof ApiError ? cause.message : 'Action impossible.';
      setActionError(text);
      notify(text, 'danger');
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error && !bill) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!bill) return <LoadingState label="Chargement de l’addition…" />;

  const closed = bill.status === 'paid' || bill.status === 'cancelled';
  const live = bill.items.filter((item) => item.status !== 'cancelled');
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.quantity * line.dish.price, 0);

  function add(dish: Dish) {
    setCart((current) => {
      const existing = current.find((line) => line.dish.id === dish.id);
      return existing
        ? current.map((line) => (line.dish.id === dish.id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...current, { dish, quantity: 1, note: '' }];
    });
  }

  async function send() {
    const ok = await run(
      () =>
        sendToKitchen(
          bill!.id,
          cart.map((line) => ({ dishId: line.dish.id, quantity: line.quantity, note: line.note.trim() || null })),
        ),
      'Envoyé en cuisine',
    );
    if (ok) {
      setCart([]);
      setReviewOpen(false);
      setOrdering(false);
      void menu.refresh();
    }
  }

  // --- Prise de commande : la carte, comme à l'écran de vente ---------------
  if (ordering) {
    const categories = menu.data?.categories ?? [];
    const dishes = menu.data?.dishes ?? [];
    const visible = category === 'all' ? dishes : dishes.filter((dish) => dish.categoryId === category);
    return (
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, styles.contentWithBar]} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setOrdering(false)} style={styles.back} accessibilityRole="button">
            <Icon name="chevron-left" size={16} color={colors.primary} />
            <Text style={styles.backText}>{billName(bill)}</Text>
          </Pressable>
          {menu.loading ? (
            <LoadingState label="Chargement de la carte…" />
          ) : (
            <>
              <View style={styles.filters}>
                <Chips
                  bleed={screenPadding}
                  value={category}
                  onChange={setCategory}
                  options={[
                    { value: 'all', label: 'Tout', badge: dishes.length },
                    ...categories.map((item) => ({ value: item.id, label: item.name, badge: item.dishesCount })),
                  ]}
                />
              </View>
              <DishGrid dishes={visible} counts={counts} onAdd={add} money={money} />
            </>
          )}
        </ScrollView>

        {cart.length > 0 && (
          <Pressable style={styles.bar} onPress={() => setReviewOpen(true)} accessibilityRole="button">
            <View style={styles.barCount}>
              <Text style={styles.barCountText}>{cartCount}</Text>
            </View>
            <Text style={styles.barLabel}>Vérifier et envoyer</Text>
            <Text style={styles.barTotal}>{money(cartTotal)}</Text>
          </Pressable>
        )}

        <Sheet
          visible={reviewOpen}
          title="Envoyer en cuisine"
          subtitle={billName(bill)}
          error={actionError}
          onClose={() => setReviewOpen(false)}
          actions={<Button label={`Envoyer ${cartCount} plat(s) en cuisine`} onPress={() => void send()} loading={busy} />}
        >
          {cart.map((line) => (
            <View key={line.dish.id} style={styles.cartLine}>
              <View style={styles.cartRow}>
                <Text style={styles.cartName} numberOfLines={2}>
                  {line.dish.name}
                </Text>
                <Stepper
                  value={line.quantity}
                  onChange={(quantity) =>
                    setCart((current) =>
                      quantity <= 0
                        ? current.filter((item) => item.dish.id !== line.dish.id)
                        : current.map((item) => (item.dish.id === line.dish.id ? { ...item, quantity } : item)),
                    )
                  }
                  compact
                />
              </View>
              <Field
                label="Remarque pour la cuisine"
                value={line.note}
                onChangeText={(note) =>
                  setCart((current) => current.map((item) => (item.dish.id === line.dish.id ? { ...item, note } : item)))
                }
                placeholder="Sans piment, bien cuit…"
              />
            </View>
          ))}
        </Sheet>
      </View>
    );
  }

  // --- L'addition --------------------------------------------------------------
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button">
          <Icon name="chevron-left" size={16} color={colors.primary} />
          <Text style={styles.backText}>Tables</Text>
        </Pressable>

        <Card reveal={0} style={styles.block}>
          <Text style={styles.billTitle}>{billName(bill)}</Text>
          <Text style={styles.billMeta}>
            {bill.guests} couvert(s) · {bill.waiter?.fullName ?? '—'} · ouverte à {formatTime(bill.openedAt)}
          </Text>
          <Text style={styles.billTotal}>{money(bill.total)}</Text>
        </Card>

        {bill.status === 'bill_requested' && (
          <View style={styles.block}>
            <Banner
              tone="info"
              title="Chez le caissier, à encaisser"
              message="Tout est servi ou l’addition a été demandée : le caissier est prévenu. Un plat ajouté maintenant rouvre l’addition."
            />
          </View>
        )}
        {bill.status === 'paid' && (
          <View style={styles.block}>
            <Banner tone="success" title="Addition payée" message={`Encaissée${bill.saleReference ? `, ticket ${bill.saleReference}` : ''}.`} />
          </View>
        )}
        {bill.status === 'cancelled' && (
          <View style={styles.block}>
            <Banner tone="danger" title="Addition annulée" message={bill.closedReason ?? ''} />
          </View>
        )}

        {bill.items.length === 0 ? (
          <EmptyState icon="menu-book" title="Rien n’est encore commandé" message="Ajoutez des plats : ils partent en cuisine en un geste." />
        ) : (
          <Card reveal={1} style={styles.block}>
            <SectionHeader title="Commande" caption={`${live.length} ligne(s) envoyée(s)`} />
            {bill.items.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <RowDivider />}
                <View style={styles.item}>
                  <View style={[styles.itemDot, { backgroundColor: ITEM_TONES[item.status] }]} />
                  <View style={styles.itemText}>
                    <Text style={[styles.itemName, item.status === 'cancelled' && styles.itemCancelled]}>
                      {item.quantity} × {item.dishName}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {ITEM_STATUS_LABELS[item.status]}
                      {item.note ? ` · « ${item.note} »` : ''}
                      {item.cancelledReason ? ` · ${item.cancelledReason}` : ''}
                    </Text>
                  </View>
                  {item.status === 'ready' && !closed && (
                    <Pressable
                      onPress={() => void run(() => markItemServed(item.id), 'Servi')}
                      style={styles.served}
                      accessibilityRole="button"
                    >
                      <Text style={styles.servedText}>Servi</Text>
                    </Pressable>
                  )}
                  {can('sales.cancel') && !closed && item.status !== 'cancelled' && (
                    <Pressable
                      onPress={() => {
                        setActionError(null);
                        setCancelItem(item);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Annuler ${item.dishName}`}
                    >
                      <Icon name="close" size={16} color={colors.textTertiary} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </Card>
        )}

        {!closed && (
          <View style={styles.actions}>
            <Button label="Ajouter des plats" onPress={() => setOrdering(true)} />
            {bill.status === 'open' && live.length > 0 && (
              <Button label="Demander l’addition" onPress={() => void run(() => requestBill(bill.id), 'Le caissier est prévenu')} variant="secondary" loading={busy} />
            )}
            {can('sales.cancel') && (
              <Button label="Annuler l’addition" onPress={() => setCancelAll(true)} variant="ghost" />
            )}
          </View>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={Boolean(cancelItem)}
        title="Annuler ce plat"
        message={`${cancelItem?.quantity ?? ''} × ${cancelItem?.dishName ?? ''} : la cuisine et le serveur sont prévenus, la portion revient au menu.`}
        confirmLabel="Annuler le plat"
        reasonLabel="Motif"
        loading={busy}
        error={actionError}
        onCancel={() => setCancelItem(null)}
        onConfirm={async (reason) => {
          const item = cancelItem;
          if (item && (await run(() => cancelBillItem(item.id, reason), 'Plat annulé'))) setCancelItem(null);
        }}
      />
      <ConfirmSheet
        visible={cancelAll}
        title="Annuler l’addition"
        message="Tous les plats non servis sont annulés et la cuisine arrête leur préparation."
        confirmLabel="Annuler l’addition"
        reasonLabel="Motif"
        loading={busy}
        error={actionError}
        onCancel={() => setCancelAll(false)}
        onConfirm={async (reason) => {
          if (await run(() => cancelBill(bill.id, reason), 'Addition annulée')) {
            setCancelAll(false);
            onBack();
          }
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Gérant : tables et seuils de la cuisine
// ---------------------------------------------------------------------------

function ManageSheet({
  visible,
  tables,
  onClose,
  onChanged,
}: {
  visible: boolean;
  tables: DiningTable[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useWorkspace();
  const [count, setCount] = useState(10);
  const [area, setArea] = useState('');
  const [name, setName] = useState('');
  const [warn, setWarn] = useState('15');
  const [late, setLate] = useState('25');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<DiningTable | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setName('');
    fetchKitchenSettings()
      .then((settings) => {
        setWarn(String(settings.warnMinutes));
        setLate(String(settings.lateMinutes));
      })
      .catch(() => undefined);
  }, [visible]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      notify(message);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet visible={visible && !toRemove} title="Tables et cuisine" error={error} onClose={onClose}>
        <SectionHeader title="Créer plusieurs tables" caption="Numérotées à la suite des tables existantes" />
        <View style={styles.guests}>
          <Text style={styles.blockLabel}>Nombre de tables</Text>
          <Stepper value={count} onChange={setCount} min={1} max={60} />
        </View>
        <Field label="Salle (facultatif)" value={area} onChangeText={setArea} placeholder="Salle, Terrasse, VIP" />
        <Button
          label={`Créer ${count} table(s)`}
          onPress={() => void run(() => createTablesBatch(count, area.trim() || null), `${count} table(s) créée(s)`)}
          loading={busy}
          variant="secondary"
        />

        <View style={styles.separator} />
        <SectionHeader title="Ajouter une table" />
        <Field label="Nom" value={name} onChangeText={setName} placeholder="Table VIP 1" />
        <Button
          label="Ajouter"
          onPress={() =>
            name.trim() && void run(() => createTable({ name: name.trim(), area: area.trim() || null }), 'Table ajoutée')
          }
          variant="secondary"
          disabled={!name.trim()}
        />

        {tables.length > 0 && (
          <>
            <View style={styles.separator} />
            <SectionHeader title="Vos tables" caption="Touchez une table pour la retirer du plan" />
            {tables.map((table, index) => (
              <View key={table.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon="grid"
                  title={table.name}
                  subtitle={table.area ?? 'Sans salle'}
                  value="Retirer"
                  valueTone="muted"
                  onPress={() => setToRemove(table)}
                />
              </View>
            ))}
          </>
        )}

        <View style={styles.separator} />
        <SectionHeader title="Attente en cuisine" caption="Un ticket change de couleur, puis le gérant est prévenu" />
        <View style={styles.hours}>
          <View style={styles.hour}>
            <AmountField label="Orange après" value={warn} onChangeText={setWarn} suffix="min" />
          </View>
          <View style={styles.hour}>
            <AmountField label="Rouge après" value={late} onChangeText={setLate} suffix="min" />
          </View>
        </View>
        <Button
          label="Enregistrer les seuils"
          onPress={() =>
            void run(
              () => updateKitchenSettings(Math.trunc(parseAmount(warn) ?? 15), Math.trunc(parseAmount(late) ?? 25)),
              'Seuils enregistrés',
            )
          }
          variant="secondary"
        />
      </Sheet>

      <ConfirmSheet
        visible={Boolean(toRemove)}
        title={`Retirer ${toRemove?.name ?? ''}`}
        message="La table disparaît du plan. Ses additions passées restent dans l’historique."
        confirmLabel="Retirer"
        loading={busy}
        error={error}
        onCancel={() => setToRemove(null)}
        onConfirm={async () => {
          const table = toRemove;
          setToRemove(null);
          if (table) await run(() => deleteTable(table.id), 'Table retirée');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  contentWithBar: {
    paddingBottom: 110,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...typography.small,
    fontSize: 11,
    color: colors.textSecondary,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    maxWidth: 180,
    minHeight: 92,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    justifyContent: 'space-between',
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.8,
  },
  tileName: {
    ...typography.bodyStrong,
    fontSize: 15,
  },
  tileState: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
  },
  tileMeta: {
    ...typography.small,
    fontSize: 11,
    color: colors.textSecondary,
  },
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    marginTop: spacing.xxl,
  },
  manageText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  guests: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  blockLabel: {
    ...typography.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.primary,
  },
  block: {
    marginBottom: spacing.lg,
  },
  billTitle: {
    ...typography.h3,
  },
  billMeta: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },
  billTotal: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 30,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  itemCancelled: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  itemMeta: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
  },
  served: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  servedText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textOnPrimary,
  },
  actions: {
    gap: spacing.md,
  },
  bar: {
    position: 'absolute',
    left: screenPadding,
    right: screenPadding,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadows.large,
  },
  barCount: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barCountText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.textOnPrimary,
  },
  barLabel: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnPrimary,
  },
  barTotal: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textOnPrimary,
  },
  cartLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cartName: {
    ...typography.bodyStrong,
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xl,
  },
  hours: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  hour: {
    flex: 1,
  },
});
