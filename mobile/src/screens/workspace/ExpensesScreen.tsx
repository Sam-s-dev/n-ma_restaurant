import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import {
  CREATABLE_CATEGORIES,
  EXPENSE_LABELS,
  cancelExpense,
  createExpense,
  listExpenses,
} from '../../api/workspace/expenses';
import type { Expense, ExpenseCategory, ExpensesPage } from '../../api/workspace/expenses';
import { PAYMENT_LABELS } from '../../api/workspace/sales';
import { STOCK_UNITS, UNIT_LABELS, createStockItem, listStock } from '../../api/workspace/stock';
import type { StockItem } from '../../api/workspace/stock';
import { formatQuantity, parseAmount } from '../../utils/money';
import { formatRelativeDay, todayISO } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const CATEGORY_ICONS: Record<ExpenseCategory, { icon: 'box' | 'users' | 'receipt' | 'settings'; color: string; background: string }> = {
  stock_purchase: { icon: 'box', color: colors.iconAmber, background: colors.pastelAmber },
  salary: { icon: 'users', color: colors.iconBlue, background: colors.pastelBlue },
  bill: { icon: 'receipt', color: colors.iconPurple, background: colors.pastelPurple },
  maintenance: { icon: 'settings', color: colors.iconGreen, background: colors.pastelGreen },
  other: { icon: 'receipt', color: colors.textSecondary, background: colors.backgroundAlt },
};

/**
 * §9 — Dépenses.
 *
 * Chaque dépense débite la caisse ; un achat de stock incrémente en plus la
 * quantité du produit concerné. Les salaires n'apparaissent qu'en lecture :
 * ils se saisissent depuis la fiche employé, pour que l'historique de paie
 * reste exact (§4).
 */
export function ExpensesScreen() {
  const { money, refreshBalance, notify } = useWorkspace();

  const [category, setCategory] = useState<'all' | ExpenseCategory>('all');
  const [page, setPage] = useState<ExpensesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Expense | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(
        await listExpenses({
          limit: 60,
          includeCancelled: true,
          ...(category === 'all' ? {} : { category }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des dépenses impossible.');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function confirmCancel(reason: string) {
    if (!detail) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelExpense(detail.id, reason);
      setConfirmOpen(false);
      setDetail(null);
      refreshBalance();
      notify('Dépense annulée');
      await load();
    } catch (cause) {
      setCancelError(cause instanceof ApiError ? cause.message : 'Annulation impossible.');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <LoadingState label="Chargement des dépenses…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const expenses = page?.items ?? [];
  const byCategory = page?.totals.byCategory ?? {};

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
        <Card reveal={0} style={styles.summary}>
          <Text style={styles.summaryLabel}>Total des dépenses affichées</Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {money(page?.totals.amount ?? 0)}
          </Text>

          <View style={styles.breakdown}>
            {Object.entries(byCategory).map(([key, total]) => (
              <View key={key} style={styles.breakdownChip}>
                <Text style={styles.breakdownLabel}>
                  {EXPENSE_LABELS[key as ExpenseCategory] ?? key}
                </Text>
                <Text style={styles.breakdownValue}>{money(total)}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.filters}>
          <Chips
            bleed={screenPadding}
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'Toutes' },
              ...(['stock_purchase', 'salary', 'bill', 'maintenance', 'other'] as ExpenseCategory[]).map(
                (value) => ({ value, label: EXPENSE_LABELS[value] }),
              ),
            ]}
          />
        </View>

        <Pressable
          style={styles.actionButton}
          onPress={() => setFormOpen(true)}
          accessibilityRole="button"
        >
          <Icon name="plus" size={16} color={colors.textOnPrimary} strokeWidth={2.5} />
          <Text style={styles.actionText}>Nouvelle dépense</Text>
        </Pressable>

        {expenses.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="Aucune dépense"
            message="Achats, factures, entretien : notez-les ici pour que votre bénéfice réel apparaisse sur le tableau de bord."
            action={<Button label="Enregistrer une dépense" onPress={() => setFormOpen(true)} />}
          />
        ) : (
          <Card reveal={1}>
            {expenses.map((expense, index) => {
              const style = CATEGORY_ICONS[expense.category] ?? CATEGORY_ICONS.other;
              const cancelled = Boolean(expense.cancelledAt);

              return (
                <View key={expense.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    icon={cancelled ? 'close' : style.icon}
                    iconColor={cancelled ? colors.textTertiary : style.color}
                    iconBackground={cancelled ? colors.backgroundAlt : style.background}
                    title={expense.description}
                    subtitle={`${formatRelativeDay(expense.expenseDate)} · ${
                      EXPENSE_LABELS[expense.category] ?? expense.category
                    }${expense.stockItemName ? ` · ${expense.stockItemName}` : ''}`}
                    value={`− ${money(expense.amount)}`}
                    valueTone={cancelled ? 'muted' : 'negative'}
                    valueCaption={cancelled ? 'Annulée' : expense.reference}
                    onPress={() => setDetail(expense)}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <ExpenseFormSheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onDone={() => {
          setFormOpen(false);
          refreshBalance();
          notify('Dépense enregistrée');
          void load();
        }}
      />

      <Sheet
        visible={Boolean(detail)}
        title={detail?.description ?? ''}
        subtitle={detail ? `${detail.reference} · ${formatRelativeDay(detail.expenseDate)}` : undefined}
        onClose={() => setDetail(null)}
        actions={
          detail && !detail.cancelledAt && detail.category !== 'salary' ? (
            <Button
              label="Annuler cette dépense"
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
            <View style={styles.detailAmount}>
              <Text style={styles.detailAmountValue}>{money(detail.amount)}</Text>
              <Text style={styles.detailAmountLabel}>
                {EXPENSE_LABELS[detail.category] ?? detail.category}
              </Text>
            </View>

            <DetailRow
              label="Règlement"
              value={PAYMENT_LABELS[detail.paymentMethod] ?? detail.paymentMethod}
            />
            {Boolean(detail.stockItemName) && (
              <DetailRow
                label="Produit"
                value={`${detail.stockItemName} · ${formatQuantity(detail.quantity ?? 0)}`}
              />
            )}
            {detail.unitPrice !== null && (
              <DetailRow label="Prix unitaire" value={money(detail.unitPrice)} />
            )}
            {Boolean(detail.employeeName) && (
              <DetailRow label="Employé" value={detail.employeeName as string} />
            )}
            {Boolean(detail.createdByName) && (
              <DetailRow label="Saisi par" value={detail.createdByName as string} />
            )}
            {Boolean(detail.cancelReason) && (
              <DetailRow label="Motif d’annulation" value={detail.cancelReason as string} />
            )}

            {detail.category === 'salary' && (
              <Text style={styles.salaryNote}>
                Ce paiement de salaire s’annule depuis la fiche de l’employé, dans le module
                Personnel.
              </Text>
            )}
          </>
        )}
      </Sheet>

      <ConfirmSheet
        visible={confirmOpen}
        title="Annuler la dépense"
        message="Le montant sera recrédité en caisse par une écriture inverse. Un achat de stock verra sa quantité retirée."
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

interface ExpenseFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

function ExpenseFormSheet({ visible, onClose, onDone }: ExpenseFormSheetProps) {
  const { currency } = useWorkspace();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('stock_purchase');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [payment, setPayment] = useState('cash');
  const [stockItemId, setStockItemId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<string>('kg');
  const [quantity, setQuantity] = useState('');
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [errors, setErrors] = useState<{ amount?: string; description?: string; stock?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount('');
    setCategory('stock_purchase');
    setDescription('');
    setExpenseDate(todayISO());
    setPayment('cash');
    setStockItemId(null);
    setNewProduct(false);
    setNewName('');
    setNewUnit('kg');
    setQuantity('');
    setErrors({});
    setError(null);

    listStock()
      .then((data) => setStockItems(data.items))
      .catch(() => undefined);
  }, [visible]);

  const isPurchase = category === 'stock_purchase';

  async function submit() {
    const value = parseAmount(amount);
    const purchasedQuantity = parseAmount(quantity) ?? 0;
    const next: { amount?: string; description?: string; stock?: string } = {};

    if (value === null || value <= 0) next.amount = 'Saisissez un montant supérieur à zéro.';
    if (description.trim().length < 1) next.description = 'Décrivez la dépense.';

    if (isPurchase) {
      if (newProduct) {
        if (newName.trim().length < 1) next.stock = 'Donnez un nom au produit acheté.';
      } else if (!stockItemId) {
        next.stock = 'Choisissez le produit acheté.';
      }
      if (purchasedQuantity <= 0) next.stock = next.stock ?? 'Indiquez la quantité achetée.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      let targetId = stockItemId;

      // Le produit est créé à quantité zéro : c'est la dépense qui l'y fait
      // entrer juste après, avec son prix d'achat réel.
      if (isPurchase && newProduct) {
        const created = await createStockItem({ name: newName.trim(), unit: newUnit, quantity: 0 });
        targetId = created.id;
      }

      await createExpense({
        amount: value as number,
        category,
        description: description.trim(),
        expenseDate: /^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ? expenseDate : todayISO(),
        paymentMethod: payment,
        ...(isPurchase && targetId ? { stockItemId: targetId, quantity: purchasedQuantity } : {}),
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  const selectedItem = stockItems.find((item) => item.id === stockItemId);

  return (
    <Sheet
      visible={visible}
      title="Nouvelle dépense"
      subtitle="Le montant sera retiré de la caisse"
      error={error}
      onClose={onClose}
      actions={<Button label="Enregistrer" onPress={submit} loading={saving} />}
    >
      <AmountField
        label="Montant"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
        }}
        placeholder="0"
        suffix={currency.symbol}
        error={errors.amount}
      />

      <Text style={styles.blockLabel}>Catégorie</Text>
      <View style={styles.spaced}>
        <Chips
          options={CREATABLE_CATEGORIES.map((value) => ({ value, label: EXPENSE_LABELS[value] }))}
          value={category}
          onChange={setCategory}
        />
      </View>

      {isPurchase && (
        <View style={styles.purchaseBlock}>
          <Text style={styles.purchaseNote}>
            Le montant sort de la caisse et la quantité achetée entre en stock, en une seule
            opération.
          </Text>

          <Text style={styles.blockLabel}>Produit acheté</Text>

          {/*
            Création du produit sur place. Renvoyer le gérant vers le module
            Stock au milieu d'une saisie de dépense lui faisait perdre son
            montant : on achète un sac d'oignons sans avoir prévu la fiche.
          */}
          {newProduct ? (
            <View style={styles.quickCreate}>
              <Field
                label="Nom du nouveau produit"
                value={newName}
                onChangeText={(value) => {
                  setNewName(value);
                  if (errors.stock) setErrors((prev) => ({ ...prev, stock: undefined }));
                }}
                placeholder="Oignons"
                autoFocus
              />

              <Text style={styles.blockLabel}>Unité</Text>
              <View style={styles.spaced}>
                <Chips
                  options={STOCK_UNITS.map((value) => ({
                    value,
                    label: UNIT_LABELS[value] ?? value,
                  }))}
                  value={newUnit}
                  onChange={setNewUnit}
                />
              </View>

              <Pressable
                onPress={() => setNewProduct(false)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.quickCancel}>Choisir un produit existant</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {stockItems.length > 0 && (
                <View style={styles.spaced}>
                  <Chips
                    options={stockItems.map((item) => ({ value: item.id, label: item.name }))}
                    value={stockItemId ?? ''}
                    onChange={(value) => {
                      setStockItemId(value);
                      if (errors.stock) setErrors((prev) => ({ ...prev, stock: undefined }));
                    }}
                  />
                </View>
              )}

              <Pressable
                onPress={() => {
                  setNewProduct(true);
                  setStockItemId(null);
                  setErrors((prev) => ({ ...prev, stock: undefined }));
                }}
                style={styles.quickAdd}
                accessibilityRole="button"
              >
                <Icon name="plus" size={15} color={colors.primary} strokeWidth={2.4} />
                <Text style={styles.quickAddText}>
                  {stockItems.length === 0
                    ? 'Créer le produit acheté'
                    : 'Le produit n’est pas dans la liste'}
                </Text>
              </Pressable>
            </>
          )}

          <AmountField
            label="Quantité achetée"
            value={quantity}
            onChangeText={(value) => {
              setQuantity(value);
              if (errors.stock) setErrors((prev) => ({ ...prev, stock: undefined }));
            }}
            placeholder="0"
            suffix={
      newProduct
        ? (UNIT_LABELS[newUnit] ?? newUnit)
        : selectedItem
          ? (UNIT_LABELS[selectedItem.unit] ?? selectedItem.unit)
          : undefined
    }
            error={errors.stock}
          />
        </View>
      )}

      <Field
        label="Description"
        value={description}
        onChangeText={(value) => {
          setDescription(value);
          if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
        }}
        placeholder="Sac de riz 25 kg"
        error={errors.description}
      />

      <Field
        label="Date"
        value={expenseDate}
        onChangeText={setExpenseDate}
        placeholder={todayISO()}
        hint="Format AAAA-MM-JJ."
      />

      <Text style={styles.blockLabel}>Mode de règlement</Text>
      <Chips
        options={[
          { value: 'cash', label: 'Espèces' },
          { value: 'mobile_money', label: 'Mobile Money' },
          { value: 'card', label: 'Carte' },
          { value: 'bank_transfer', label: 'Virement' },
        ]}
        value={payment}
        onChange={setPayment}
      />
    </Sheet>
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  summary: {
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  summaryValue: {
    ...typography.h1,
    fontSize: 25,
    lineHeight: 32,
    color: colors.danger,
    marginTop: 1,
  },
  breakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  breakdownChip: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  breakdownLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  breakdownValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textPrimary,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginBottom: spacing.lg,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  blockLabel: {
    ...typography.bodyStrong,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  spaced: {
    marginBottom: spacing.lg,
  },
  purchaseBlock: {
    marginBottom: spacing.sm,
  },
  purchaseNote: {
    ...typography.small,
    fontSize: 12,
    color: colors.iconAmber,
    backgroundColor: colors.pastelAmber,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  quickCreate: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginBottom: spacing.lg,
  },
  quickCancel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  quickAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    marginBottom: spacing.lg,
  },
  quickAddText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primary,
  },
  detailAmount: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
  },
  detailAmountValue: {
    ...typography.h1,
    fontSize: 24,
    color: colors.danger,
  },
  detailAmountLabel: {
    ...typography.small,
    fontSize: 12,
    color: colors.textSecondary,
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
  salaryNote: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: spacing.lg,
  },
});
