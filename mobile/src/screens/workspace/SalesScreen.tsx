import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips, Segmented } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { Stepper } from '../../components/workspace/Stepper';
import { ApiError } from '../../api/client';
import { listCategories, listDishes } from '../../api/workspace/menu';
import type { Category, Dish } from '../../api/workspace/menu';
import {
  PAYMENT_LABELS,
  STATUS_LABELS,
  cancelSale,
  createSale,
  getSale,
  listSales,
} from '../../api/workspace/sales';
import type { PaymentMethod, Sale, SaleStatus, SalesPage } from '../../api/workspace/sales';
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
          {visibleDishes.map((dish) => {
            const inCart = cart.find((line) => line.dish.id === dish.id)?.quantity ?? 0;

            return (
              <Pressable
                key={dish.id}
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

                {!dish.isAvailable && <Text style={styles.dishOff}>En rupture</Text>}
              </Pressable>
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

      <ReceiptSheet sale={receipt} money={money} onClose={() => setReceipt(null)} />
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
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) {
      setError(null);
      setNameError(undefined);
    }
  }, [visible]);

  const isCredit = payment === 'credit';

  async function submit() {
    // §8 — sans client identifié, impossible de savoir qui doit l'argent.
    if (isCredit && customerName.trim().length < 2) {
      setNameError('Indiquez le nom du client.');
      return;
    }
    setNameError(undefined);
    setError(null);
    setSaving(true);

    try {
      const sale = await createSale({
        items: cart.map((line) => ({ dishId: line.dish.id, quantity: line.quantity })),
        paymentMethod: payment,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(isCredit ? { customerName: customerName.trim() } : {}),
        ...(isCredit && customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
        ...(isCredit && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? { dueDate } : {}),
      });

      setCustomerName('');
      setCustomerPhone('');
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
          <Field
            label="Nom du client"
            value={customerName}
            onChangeText={(value) => {
              setCustomerName(value);
              if (nameError) setNameError(undefined);
            }}
            placeholder="Mariama Diallo"
            error={nameError}
          />
          <Field
            label="Téléphone (facultatif)"
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="620 00 00 00"
            keyboardType="phone-pad"
            hint="Un client déjà connu par son numéro sera réutilisé."
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

interface ReceiptSheetProps {
  sale: Sale | null;
  money: (value: number) => string;
  onClose: () => void;
}

/** Ticket affiché juste après la vente : le gérant peut le relire au client. */
function ReceiptSheet({ sale, money, onClose }: ReceiptSheetProps) {
  return (
    <Sheet
      visible={Boolean(sale)}
      title="Vente enregistrée"
      subtitle={sale ? `Ticket ${sale.reference}` : undefined}
      onClose={onClose}
      actions={<Button label="Nouvelle vente" onPress={onClose} />}
    >
      {sale && (
        <>
          <View style={styles.receiptBanner}>
            <View style={styles.receiptIcon}>
              <Icon name="check" size={20} color={colors.textOnPrimary} strokeWidth={2.8} />
            </View>
            <Text style={styles.receiptTotal}>{money(sale.totalAmount)}</Text>
            <Text style={styles.receiptMethod}>
              {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
              {sale.customerName ? ` · ${sale.customerName}` : ''}
            </Text>
          </View>

          {(sale.items ?? []).map((item) => (
            <View key={item.id} style={styles.receiptLine}>
              <Text style={styles.receiptLineName} numberOfLines={1}>
                {item.quantity} × {item.dishName}
              </Text>
              <Text style={styles.receiptLineValue}>{money(item.lineTotal)}</Text>
            </View>
          ))}

          {sale.credit && (
            <Text style={styles.receiptCredit}>
              Créance ouverte : {money(sale.credit.amountLeft)} à recouvrer.
            </Text>
          )}
        </>
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
          <Card style={styles.totalsCard}>
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
          <Card>
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
  dishCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    maxWidth: 220,
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
