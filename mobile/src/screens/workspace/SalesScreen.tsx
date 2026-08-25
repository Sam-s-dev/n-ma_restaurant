import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips, Segmented } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Receipt, shareReceipt } from '../../components/workspace/Receipt';
import { Reveal } from '../../components/workspace/Motion';
import { Sheet } from '../../components/workspace/Sheet';
import { Stepper } from '../../components/workspace/Stepper';
import { ApiError, mediaUrl } from '../../api/client';
import { createCustomer, listCustomers } from '../../api/workspace/customers';
import type { Customer } from '../../api/workspace/customers';
import { listCategories, listDishes } from '../../api/workspace/menu';
import type { Category, Dish } from '../../api/workspace/menu';
import {
  PAYMENT_LABELS,
  STATUS_LABELS,
  cancelSale,
  createSale,
  getReceipt,
  getSale,
  listSales,
} from '../../api/workspace/sales';
import type {
  PaymentMethod,
  Receipt as ReceiptData,
  Sale,
  SaleStatus,
  SalesPage,
} from '../../api/workspace/sales';
import { SearchField } from '../../components/workspace/SearchField';
import { formatDateTime, formatRelativeDay, todayISO } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, shadows, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

interface CartLine {
  dish: Dish;
  quantity: number;
}

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'card', label: 'Carte' },
  { value: 'credit', label: 'Crédit' },
];

const HISTORY_FILTERS = [
  { value: 'all' as const, label: 'Toutes' },
  { value: 'paid' as const, label: 'Encaissées' },
  { value: 'credit' as const, label: 'À crédit' },
  { value: 'cancelled' as const, label: 'Annulées' },
];

/**
 * §8 — Prise de commande et historique des ventes.
 *
 * Les deux usages tiennent dans un onglet : on encaisse toute la journée,
 * on consulte l'historique de temps en temps. La bascule en haut évite de
 * naviguer entre deux écrans distincts pendant le service.
 */
export function SalesScreen() {
  const [view, setView] = useState<'new' | 'history'>('new');

  return (
    <View style={styles.screen}>
      <View style={styles.switcher}>
        <Segmented
          options={[
            { value: 'new', label: 'Nouvelle vente' },
            { value: 'history', label: 'Historique' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === 'new' ? <NewSale /> : <SalesHistory />}
    </View>
  );
}

// =========================================================================
// Prise de commande
// =========================================================================

function NewSale() {
  const { money, currency, refreshBalance, notify, navigate } = useWorkspace();

  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextCategories, nextDishes] = await Promise.all([listCategories(), listDishes()]);
      setCategories(nextCategories);
      setDishes(nextDishes);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement du menu impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleDishes = useMemo(
    () => (category === 'all' ? dishes : dishes.filter((dish) => dish.categoryId === category)),
    [dishes, category],
  );

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.dish.price * line.quantity, 0),
    [cart],
  );
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function addToCart(dish: Dish) {
    setCart((current) => {
      const existing = current.find((line) => line.dish.id === dish.id);
      if (existing) {
        return current.map((line) =>
          line.dish.id === dish.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { dish, quantity: 1 }];
    });
  }

  function setQuantity(dishId: string, quantity: number) {
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.dish.id !== dishId)
        : current.map((line) => (line.dish.id === dishId ? { ...line, quantity } : line)),
    );
  }

  if (loading) return <LoadingState label="Chargement du menu…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  if (dishes.length === 0) {
    return (
      <EmptyState
        icon="menu-book"
        title="Votre menu est vide"
        message="Ajoutez vos plats et leurs prix : ils apparaîtront ici pour être vendus en deux gestes."
        action={<Button label="Créer mon menu" onPress={() => navigate('menu')} />}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, cart.length > 0 && styles.contentWithCart]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filters}>
          <Chips
            bleed={screenPadding}
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'Tout', badge: dishes.length },
              ...categories.map((item) => ({
                value: item.id,
                label: item.name,
                badge: item.dishesCount,
              })),
            ]}
          />
        </View>

        <View style={styles.dishGrid}>
          {visibleDishes.map((dish, position) => {
            const inCart = cart.find((line) => line.dish.id === dish.id)?.quantity ?? 0;

            return (
              <Reveal key={dish.id} index={position} style={styles.dishSlot}>
              <Pressable
                onPress={() => dish.isAvailable && addToCart(dish)}
                disabled={!dish.isAvailable}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${dish.name}`}
                style={({ pressed }) => [
                  styles.dishCard,
                  !dish.isAvailable && styles.dishCardOff,
                  pressed && dish.isAvailable && styles.dishCardPressed,
                ]}
              >
                {dish.photoMediaId ? (
                  <Image
                    source={{ uri: mediaUrl(dish.photoMediaId) as string }}
                    style={styles.dishImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.dishImage, styles.dishImagePlaceholder]}>
                    <Icon name="menu-book" size={20} color={colors.textTertiary} strokeWidth={1.7} />
                  </View>
                )}

                {inCart > 0 && (
                  <View style={styles.dishCount}>
                    <Text style={styles.dishCountText}>{inCart}</Text>
                  </View>
                )}

                <Text style={styles.dishName} numberOfLines={2}>
                  {dish.name}
                </Text>
                <Text style={styles.dishCategory} numberOfLines={1}>
                  {dish.categoryName ?? 'Sans catégorie'}
                </Text>
                <Text style={styles.dishPrice} numberOfLines={1}>
                  {money(dish.price)}
                </Text>

                {!dish.isAvailable ? (
                  <Text style={styles.dishOff}>En rupture</Text>
                ) : dish.availableQuantity !== null ? (
                  <Text
                    style={[styles.dishStock, dish.availableQuantity <= 3 && styles.dishStockLow]}
                  >
                    {dish.availableQuantity} portion(s)
                  </Text>
                ) : null}
              </Pressable>
              </Reveal>
            );
          })}
        </View>

        {visibleDishes.length === 0 && (
          <Text style={styles.noDish}>Aucun plat dans cette catégorie.</Text>
        )}
      </ScrollView>

      {cart.length > 0 && (
        <Pressable style={styles.cartBar} onPress={() => setCheckoutOpen(true)}>
          <View style={styles.cartCount}>
            <Text style={styles.cartCountText}>{itemCount}</Text>
          </View>
          <View style={styles.cartTexts}>
            <Text style={styles.cartLabel}>Panier</Text>
            <Text style={styles.cartTotal} numberOfLines={1}>
              {money(total)}
            </Text>
          </View>
          <View style={styles.cartCta}>
            <Text style={styles.cartCtaText}>Encaisser</Text>
            <Icon name="chevron-right" size={16} color={colors.textOnPrimary} strokeWidth={2.4} />
          </View>
        </Pressable>
      )}

      <CheckoutSheet
        visible={checkoutOpen}
        cart={cart}
        total={total}
        currencySymbol={currency.symbol}
        money={money}
        onClose={() => setCheckoutOpen(false)}
        onChangeQuantity={setQuantity}
        onDone={(sale) => {
          setCheckoutOpen(false);
          setCart([]);
          setReceipt(sale);
          refreshBalance();
          notify(`Vente ${sale.reference} enregistrée`);
        }}
      />

      <ReceiptSheet sale={receipt} onClose={() => setReceipt(null)} />
    </View>
  );
}

interface CheckoutSheetProps {
  visible: boolean;
  cart: CartLine[];
  total: number;
  currencySymbol: string;
  money: (value: number) => string;
  onClose: () => void;
  onChangeQuantity: (dishId: string, quantity: number) => void;
  onDone: (sale: Sale) => void;
}

function CheckoutSheet({
  visible,
  cart,
  total,
  currencySymbol,
  money,
  onClose,
  onChangeQuantity,
  onDone,
}: CheckoutSheetProps) {
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) {
      setError(null);
      setCustomerError(undefined);
    }
  }, [visible]);

  const isCredit = payment === 'credit';

  async function submit() {
    // §8 — La dette doit pointer sur une fiche client existante, sinon
    // personne ne saura à qui la réclamer le jour du remboursement.
    if (isCredit && !customer) {
      setCustomerError('Choisissez le client, ou enregistrez-le d’abord.');
      return;
    }
    setCustomerError(undefined);
    setError(null);
    setSaving(true);

    try {
      const sale = await createSale({
        items: cart.map((line) => ({ dishId: line.dish.id, quantity: line.quantity })),
        paymentMethod: payment,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(customer ? { customerId: customer.id } : {}),
        ...(isCredit && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? { dueDate } : {}),
      });

      setCustomer(null);
      setDueDate('');
      setNote('');
      setPayment('cash');
      onDone(sale);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Encaisser la commande"
      subtitle={`${cart.length} plat(s) · ${money(total)}`}
      error={error}
      onClose={onClose}
      actions={
        <Button
          label={isCredit ? 'Enregistrer à crédit' : `Encaisser ${money(total)}`}
          onPress={submit}
          loading={saving}
        />
      }
    >
      {cart.map((line, index) => (
        <View key={line.dish.id}>
          {index > 0 && <RowDivider />}
          <View style={styles.cartLine}>
            <View style={styles.cartLineTexts}>
              <Text style={styles.cartLineName} numberOfLines={1}>
                {line.dish.name}
              </Text>
              <Text style={styles.cartLinePrice}>
                {money(line.dish.price)} × {line.quantity} = {money(line.dish.price * line.quantity)}
              </Text>
            </View>
            <Stepper
              value={line.quantity}
              onChange={(quantity) => onChangeQuantity(line.dish.id, quantity)}
              compact
            />
          </View>
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total à payer</Text>
        <Text style={styles.totalValue}>{money(total)}</Text>
      </View>

      <Text style={styles.blockLabel}>Mode de règlement</Text>
      <View style={styles.paymentGrid}>
        {PAYMENT_OPTIONS.map((option) => {
          const selected = option.value === payment;
          return (
            <Pressable
              key={option.value}
              onPress={() => setPayment(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.paymentChip, selected && styles.paymentChipSelected]}
            >
              <Text style={[styles.paymentText, selected && styles.paymentTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isCredit && (
        <View style={styles.creditBlock}>
          <Text style={styles.creditNote}>
            La vente ne rentrera pas en caisse : une créance sera ouverte au nom du client.
          </Text>

          <CustomerPicker
            selected={customer}
            onSelect={(next) => {
              setCustomer(next);
              setCustomerError(undefined);
            }}
            error={customerError}
          />

          <Field
            label="Échéance (facultatif)"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder={todayISO()}
            hint="Format AAAA-MM-JJ."
          />
        </View>
      )}

      <Field
        label="Note (facultatif)"
        value={note}
        onChangeText={setNote}
        placeholder="Table 4, à emporter…"
      />

      <Text style={styles.currencyHint}>Montants en {currencySymbol}.</Text>
    </Sheet>
  );
}

interface CustomerPickerProps {
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
  error?: string | undefined;
}

/**
 * Choix du client d'une vente à crédit.
 *
 * Seules les fiches déjà enregistrées sont proposées : un nom tapé
 * librement créait un client par vente — « Mariama », « mariama »,
 * « Mariama D. » finissaient en trois dettes distinctes, et plus personne
 * ne savait qui devait quoi le jour du remboursement.
 *
 * Un client inconnu peut être enregistré sans quitter la vente : la fiche
 * est réellement créée, on la retrouvera dans Clients et dans Créances.
 */
function CustomerPicker({ selected, onSelect, error }: CustomerPickerProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listCustomers();
      setCustomers(result.items);
    } catch {
      // La création reste possible même si la liste n'a pas pu être lue.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? customers.filter(
          (item) =>
            item.fullName.toLowerCase().includes(term) || (item.phone ?? '').includes(term),
        )
      : customers;
    return list.slice(0, 8);
  }, [customers, search]);

  async function create() {
    if (newName.trim().length < 2) {
      setFormError('Indiquez le nom du client.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await createCustomer({
        fullName: newName.trim(),
        phone: newPhone.trim() === '' ? null : newPhone.trim(),
      });
      setCustomers((current) => [created, ...current]);
      onSelect(created);
      setCreating(false);
      setNewName('');
      setNewPhone('');
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (selected) {
    return (
      <View style={styles.pickerWrapper}>
        <Text style={styles.blockLabel}>Client</Text>
        <View style={styles.selectedCustomer}>
          <View style={styles.selectedAvatar}>
            <Text style={styles.selectedInitials}>{initialsOf(selected.fullName)}</Text>
          </View>
          <View style={styles.selectedTexts}>
            <Text style={styles.selectedName} numberOfLines={1}>
              {selected.fullName}
            </Text>
            <Text style={styles.selectedMeta} numberOfLines={1}>
              {selected.phone ?? 'Sans téléphone'}
            </Text>
          </View>
          <Pressable
            onPress={() => onSelect(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Changer de client"
          >
            <Icon name="close" size={16} color={colors.textTertiary} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (creating) {
    return (
      <View style={styles.pickerWrapper}>
        <Text style={styles.blockLabel}>Enregistrer le client</Text>
        <Field
          label="Nom complet"
          value={newName}
          onChangeText={setNewName}
          placeholder="Mariama Diallo"
          autoFocus
          error={formError ?? undefined}
        />
        <Field
          label="Téléphone (facultatif)"
          value={newPhone}
          onChangeText={setNewPhone}
          placeholder="620 00 00 00"
          keyboardType="phone-pad"
        />
        <View style={styles.pickerActions}>
          <Pressable
            onPress={() => void create()}
            disabled={saving}
            style={styles.pickerPrimary}
            accessibilityRole="button"
          >
            <Text style={styles.pickerPrimaryText}>
              {saving ? 'Enregistrement…' : 'Enregistrer et choisir'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setCreating(false)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.pickerCancel}>Revenir à la liste</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pickerWrapper}>
      <Text style={styles.blockLabel}>Client</Text>

      <SearchField value={search} onChangeText={setSearch} placeholder="Nom ou téléphone…" />

      {Boolean(error) && <Text style={styles.pickerError}>{error}</Text>}

      <View style={styles.pickerList}>
        {loading ? (
          <Text style={styles.pickerEmpty}>Chargement des clients…</Text>
        ) : matches.length === 0 ? (
          <Text style={styles.pickerEmpty}>
            {customers.length === 0
              ? 'Aucun client enregistré pour l’instant.'
              : 'Aucun client ne correspond à cette recherche.'}
          </Text>
        ) : (
          matches.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
            >
              {index > 0 && <View style={styles.pickerRowLine} />}
              <View style={styles.pickerAvatar}>
                <Text style={styles.pickerInitials}>{initialsOf(item.fullName)}</Text>
              </View>
              <View style={styles.selectedTexts}>
                <Text style={styles.selectedName} numberOfLines={1}>
                  {item.fullName}
                </Text>
                <Text style={styles.selectedMeta} numberOfLines={1}>
                  {item.phone ?? 'Sans téléphone'}
                </Text>
              </View>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} strokeWidth={2.3} />
            </Pressable>
          ))
        )}
      </View>

      <Pressable
        onPress={() => {
          setFormError(null);
          setNewName(search.trim());
          setCreating(true);
        }}
        style={styles.pickerAdd}
        accessibilityRole="button"
      >
        <Icon name="plus" size={15} color={colors.primary} strokeWidth={2.4} />
        <Text style={styles.pickerAddText}>Enregistrer un nouveau client</Text>
      </Pressable>
    </View>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

interface ReceiptSheetProps {
  sale: Sale | null;
  onClose: () => void;
}

/**
 * Ticket affiché juste après la vente, aux couleurs du restaurant.
 *
 * Il est rechargé depuis `/sales/:id/receipt` plutôt que reconstruit à
 * partir de la réponse de création : c'est le serveur qui détient l'en-tête
 * du restaurant (nom, logo, adresse), et le ticket doit refléter les
 * paramètres du moment.
 */
function ReceiptSheet({ sale, onClose }: ReceiptSheetProps) {
  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sale) {
      setData(null);
      return;
    }
    setError(null);
    getReceipt(sale.id)
      .then(setData)
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Ticket indisponible.'),
      );
  }, [sale]);

  return (
    <Sheet
      visible={Boolean(sale)}
      title="Vente enregistrée"
      subtitle={sale ? `Ticket ${sale.reference}` : undefined}
      error={error}
      onClose={onClose}
      actions={
        <>
          {data && (
            <Button
              label="Envoyer le ticket au client"
              onPress={() => void shareReceipt(data)}
              variant="secondary"
            />
          )}
          <Button label="Nouvelle vente" onPress={onClose} />
        </>
      }
    >
      <View style={styles.successBadge}>
        <View style={styles.successIcon}>
          <Icon name="check" size={18} color={colors.textOnPrimary} strokeWidth={2.8} />
        </View>
        <Text style={styles.successText}>Encaissement enregistré</Text>
      </View>

      {data ? (
        <Receipt data={data} />
      ) : (
        <Text style={styles.receiptLoading}>Préparation du ticket…</Text>
      )}
    </Sheet>
  );
}

// =========================================================================
// Historique
// =========================================================================

function SalesHistory() {
  const { money, refreshBalance, notify } = useWorkspace();

  const [filter, setFilter] = useState<'all' | SaleStatus>('all');
  const [page, setPage] = useState<SalesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<Sale | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await listSales({ limit: 50, ...(filter === 'all' ? {} : { status: filter }) }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des ventes impossible.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function openDetail(sale: Sale) {
    setDetail(sale);
    // La liste ne porte pas les lignes : on va chercher le détail complet.
    try {
      setDetail(await getSale(sale.id));
    } catch {
      // On garde la version résumée plutôt que de fermer la feuille.
    }
  }

  async function confirmCancel(reason: string) {
    if (!detail) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelSale(detail.id, reason);
      setConfirmOpen(false);
      setDetail(null);
      refreshBalance();
      notify('Vente annulée');
      await load();
    } catch (cause) {
      setCancelError(cause instanceof ApiError ? cause.message : 'Annulation impossible.');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <LoadingState label="Chargement des ventes…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const sales = page?.items ?? [];

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
        <View style={styles.filters}>
          <Chips bleed={screenPadding} options={HISTORY_FILTERS} value={filter} onChange={setFilter} />
        </View>

        {page && (
          <Card reveal={0} style={styles.totalsCard}>
            <View style={styles.totalsRow}>
              <Totals label="Chiffre d’affaires" value={money(page.totals.amount)} />
              <View style={styles.totalsSeparator} />
              <Totals label="Encaissé" value={money(page.totals.cashed)} tone={colors.success} />
              <View style={styles.totalsSeparator} />
              <Totals label="À crédit" value={money(page.totals.credit)} tone={colors.warning} />
            </View>
          </Card>
        )}

        {sales.length === 0 ? (
          <EmptyState
            icon="ticket"
            title="Aucune vente"
            message="Les ventes enregistrées apparaîtront ici, du plus récent au plus ancien."
          />
        ) : (
          <Card reveal={1}>
            {sales.map((sale, index) => (
              <View key={sale.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon={sale.status === 'cancelled' ? 'close' : 'ticket'}
                  iconColor={toneOf(sale.status).color}
                  iconBackground={toneOf(sale.status).background}
                  title={sale.reference}
                  subtitle={`${formatDateTime(sale.soldAt)} · ${
                    PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod
                  }${sale.customerName ? ` · ${sale.customerName}` : ''}`}
                  value={money(sale.totalAmount)}
                  valueTone={sale.status === 'cancelled' ? 'muted' : 'neutral'}
                  valueCaption={STATUS_LABELS[sale.status]}
                  onPress={() => void openDetail(sale)}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <Sheet
        visible={Boolean(detail)}
        title={detail?.reference ?? ''}
        subtitle={detail ? formatDateTime(detail.soldAt) : undefined}
        onClose={() => setDetail(null)}
        actions={
          detail && detail.status !== 'cancelled' ? (
            <Button
              label="Annuler cette vente"
              onPress={() => {
                setCancelError(null);
                setConfirmOpen(true);
              }}
              variant="secondary"
            />
          ) : undefined
        }
      >
        {detail && (
          <>
            {(detail.items ?? []).map((item) => (
              <View key={item.id} style={styles.receiptLine}>
                <Text style={styles.receiptLineName} numberOfLines={1}>
                  {item.quantity} × {item.dishName}
                </Text>
                <Text style={styles.receiptLineValue}>{money(item.lineTotal)}</Text>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{money(detail.totalAmount)}</Text>
            </View>

            <DetailRow
              label="Règlement"
              value={PAYMENT_LABELS[detail.paymentMethod] ?? detail.paymentMethod}
            />
            <DetailRow label="Statut" value={STATUS_LABELS[detail.status]} />
            {Boolean(detail.customerName) && (
              <DetailRow label="Client" value={detail.customerName as string} />
            )}
            {Boolean(detail.createdByName) && (
              <DetailRow label="Encaissé par" value={detail.createdByName as string} />
            )}
            {Boolean(detail.note) && <DetailRow label="Note" value={detail.note as string} />}
            {Boolean(detail.cancelReason) && (
              <DetailRow label="Motif d’annulation" value={detail.cancelReason as string} />
            )}

            {detail.credit && (
              <View style={styles.creditRecap}>
                <Text style={styles.creditRecapTitle}>Créance</Text>
                <Text style={styles.creditRecapText}>
                  {money(detail.credit.amountPaid)} remboursés sur {money(detail.credit.amountDue)}.
                  Reste {money(detail.credit.amountLeft)}
                  {detail.credit.dueDate ? ` · échéance ${formatRelativeDay(detail.credit.dueDate)}` : ''}.
                </Text>
              </View>
            )}
          </>
        )}
      </Sheet>

      <ConfirmSheet
        visible={confirmOpen}
        title="Annuler la vente"
        message="Les écritures de caisse seront contre-passées, jamais effacées. Le motif restera visible dans le grand livre."
        confirmLabel="Confirmer l’annulation"
        reasonLabel="Motif"
        loading={cancelling}
        error={cancelError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={(reason) => void confirmCancel(reason)}
      />
    </View>
  );
}

function Totals({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.totalsItem}>
      <Text style={styles.totalsLabel}>{label}</Text>
      <Text style={[styles.totalsValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function toneOf(status: SaleStatus): { color: string; background: string } {
  if (status === 'cancelled') return { color: colors.textTertiary, background: colors.backgroundAlt };
  if (status === 'credit') return { color: colors.iconAmber, background: colors.pastelAmber };
  return { color: colors.iconGreen, background: colors.pastelGreen };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  switcher: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  contentWithCart: {
    paddingBottom: 110,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  dishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  dishSlot: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    maxWidth: 220,
  },
  dishCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.soft,
  },
  dishCardOff: {
    opacity: 0.55,
  },
  dishCardPressed: {
    transform: [{ scale: 0.975 }],
    borderColor: colors.primary,
  },
  dishImage: {
    width: '100%',
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
    marginBottom: spacing.md,
  },
  dishImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishStock: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
    marginTop: 2,
  },
  dishStockLow: {
    color: colors.warning,
  },
  dishCount: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishCountText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textOnPrimary,
  },
  dishName: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
    paddingRight: spacing.xl,
  },
  dishCategory: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
    marginTop: 1,
  },
  dishPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  dishOff: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.danger,
    marginTop: 2,
  },
  noDish: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  cartBar: {
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
  cartCount: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCountText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  cartTexts: {
    flex: 1,
  },
  cartLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  cartTotal: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textOnPrimary,
  },
  cartCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  cartCtaText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  cartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  cartLineTexts: {
    flex: 1,
  },
  cartLineName: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  cartLinePrice: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
  },
  totalLabel: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  totalValue: {
    ...typography.h2,
    fontSize: 20,
    color: colors.primary,
  },
  blockLabel: {
    ...typography.bodyStrong,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  paymentChip: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  paymentChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  paymentText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  paymentTextSelected: {
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  creditBlock: {
    marginBottom: spacing.sm,
  },
  pickerWrapper: {
    marginBottom: spacing.lg,
  },
  pickerList: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  pickerRowPressed: {
    backgroundColor: colors.backgroundAlt,
  },
  pickerRowLine: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  pickerAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.pastelPink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerInitials: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.iconPink,
  },
  pickerEmpty: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
    padding: spacing.lg,
    textAlign: 'center',
  },
  pickerError: {
    ...typography.small,
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
  pickerAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  pickerAddText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
  },
  pickerActions: {
    gap: spacing.md,
    alignItems: 'center',
  },
  pickerPrimary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  pickerPrimaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  pickerCancel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  selectedCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  selectedAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedInitials: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
  },
  selectedTexts: {
    flex: 1,
  },
  selectedName: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
  },
  selectedMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  creditNote: {
    ...typography.small,
    fontSize: 12,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  currencyHint: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    marginBottom: spacing.lg,
  },
  successIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    ...typography.bodyStrong,
    fontSize: 13,
    color: colors.success,
  },
  receiptLoading: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  receiptBanner: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.successSoft,
    borderRadius: radius.lg,
  },
  receiptIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  receiptTotal: {
    ...typography.h1,
    fontSize: 24,
    color: colors.success,
  },
  receiptMethod: {
    ...typography.small,
    fontSize: 12,
    color: colors.textSecondary,
  },
  receiptLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 6,
  },
  receiptLineName: {
    flex: 1,
    ...typography.small,
    fontSize: 13,
    color: colors.textPrimary,
  },
  receiptLineValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  receiptCredit: {
    ...typography.small,
    fontSize: 12,
    color: colors.warning,
    marginTop: spacing.md,
  },
  totalsCard: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalsItem: {
    flex: 1,
  },
  totalsLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  totalsValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: 1,
  },
  totalsSeparator: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailLabel: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
  },
  detailValue: {
    flex: 1,
    ...typography.small,
    fontSize: 12,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  creditRecap: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  creditRecapTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.warning,
  },
  creditRecapText: {
    ...typography.small,
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 2,
  },
});
