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
  approvePurchase,
  cancelPurchase,
  completePurchase,
  createPurchase,
  listPurchases,
  PURCHASE_STATUS_LABELS,
  rejectPurchase,
} from '../../api/workspace/purchases';
import type { PurchaseRequest, PurchasesPage, PurchaseStatus } from '../../api/workspace/purchases';
import { listStock, STOCK_UNITS, UNIT_LABELS } from '../../api/workspace/stock';
import type { StockItem } from '../../api/workspace/stock';
import { formatDateTime } from '../../utils/date';
import { formatQuantity, parseAmount } from '../../utils/money';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const FILTERS: Array<{ value: 'all' | PurchaseStatus; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Approuvées' },
  { value: 'completed', label: 'Achetées' },
  { value: 'rejected', label: 'Refusées' },
];

const STATUS_TONES: Record<PurchaseStatus, { color: string; background: string }> = {
  pending: { color: colors.iconAmber, background: colors.pastelAmber },
  approved: { color: colors.iconBlue, background: colors.pastelBlue },
  completed: { color: colors.iconGreen, background: colors.pastelGreen },
  rejected: { color: colors.iconRed, background: colors.pastelRed },
  cancelled: { color: colors.textTertiary, background: colors.backgroundAlt },
};

const unitLabel = (unit: string | null) => (unit ? (UNIT_LABELS[unit] ?? unit) : undefined);

/**
 * Demandes d'achat.
 *
 * Le magasinier demande, avec un montant estimé ; le gérant approuve un
 * plafond ou refuse avec un motif ; une fois l'accord donné, l'achat réel
 * est enregistré — la caisse baisse et le stock monte, sans pouvoir
 * dépasser le plafond. Chaque étape notifie l'autre partie.
 */
export function PurchasesScreen() {
  const { money, balance, can, profile, notify, refreshBalance } = useWorkspace();
  const canRequest = can('purchases.request');
  const isApprover = can('purchases.approve');

  const [filter, setFilter] = useState<'all' | PurchaseStatus>('all');
  const [page, setPage] = useState<PurchasesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseRequest | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await listPurchases({ limit: 60, ...(filter === 'all' ? {} : { status: filter }) }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des demandes impossible.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  function done(message: string) {
    setDetail(null);
    setApproveOpen(false);
    setCompleteOpen(false);
    setRejectOpen(false);
    setCancelOpen(false);
    notify(message);
    refreshBalance();
    void load();
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      done(message);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Chargement des demandes…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const requests = page?.items ?? [];
  const isMine = (request: PurchaseRequest) => request.requestedById === profile.user.id;

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
          <View style={styles.summaryRow}>
            <SummaryItem label="En caisse" value={money(balance)} tone={colors.success} />
            <View style={styles.separator} />
            <SummaryItem
              label="En attente"
              value={String(page?.pendingCount ?? 0)}
              tone={colors.warning}
            />
            <View style={styles.separator} />
            <SummaryItem label="À acheter" value={String(page?.approvedCount ?? 0)} />
          </View>
          <Text style={styles.summaryHint}>
            {isApprover
              ? 'Les demandes en attente réclament votre décision.'
              : 'Faites une demande : vous pourrez acheter dès que le gérant l’aura approuvée.'}
          </Text>
        </Card>

        {canRequest && (
          <Pressable
            style={styles.actionButton}
            onPress={() => setNewOpen(true)}
            accessibilityRole="button"
          >
            <Icon name="plus" size={16} color={colors.textOnPrimary} strokeWidth={2.5} />
            <Text style={styles.actionText}>Nouvelle demande d’achat</Text>
          </Pressable>
        )}

        <View style={styles.filters}>
          <Chips bleed={screenPadding} options={FILTERS} value={filter} onChange={setFilter} />
        </View>

        {requests.length === 0 ? (
          <EmptyState
            icon="cart"
            title="Aucune demande"
            message="Les demandes d’achat de marchandise apparaîtront ici, avec leur décision."
          />
        ) : (
          <Card reveal={1}>
            {requests.map((request, index) => {
              const tone = STATUS_TONES[request.status];
              const amount = request.paidAmount ?? request.approvedAmount ?? request.estimatedAmount;
              return (
                <View key={request.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    icon="cart"
                    iconColor={tone.color}
                    iconBackground={tone.background}
                    title={`${formatQuantity(request.quantity, unitLabel(request.unit))} · ${request.itemName}`}
                    subtitle={`${request.reference} · ${request.requestedByName ?? '—'} · ${formatDateTime(request.createdAt)}`}
                    value={money(amount)}
                    valueCaption={PURCHASE_STATUS_LABELS[request.status]}
                    valueTone={request.status === 'cancelled' || request.status === 'rejected' ? 'muted' : 'neutral'}
                    onPress={() => {
                      setActionError(null);
                      setDetail(request);
                    }}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <NewRequestSheet
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        onDone={() => {
          setNewOpen(false);
          notify('Demande envoyée au gérant');
          void load();
        }}
      />

      <Sheet
        visible={Boolean(detail) && !approveOpen && !completeOpen && !rejectOpen && !cancelOpen}
        title={detail ? `${detail.reference} · ${PURCHASE_STATUS_LABELS[detail.status]}` : ''}
        subtitle={detail?.itemName}
        error={actionError}
        onClose={() => setDetail(null)}
        actions={
          detail ? (
            <>
              {detail.status === 'pending' && isApprover && (
                <>
                  <Button label="Approuver" onPress={() => setApproveOpen(true)} />
                  <Button
                    label="Refuser"
                    onPress={() => setRejectOpen(true)}
                    variant="secondary"
                  />
                </>
              )}
              {detail.status === 'approved' && (isMine(detail) || isApprover) && (
                <Button label="Enregistrer l’achat" onPress={() => setCompleteOpen(true)} />
              )}
              {(detail.status === 'pending' || detail.status === 'approved') &&
                (isMine(detail) || isApprover) && (
                  <Button
                    label="Annuler la demande"
                    onPress={() => setCancelOpen(true)}
                    variant="ghost"
                  />
                )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <>
            <DetailRow
              label="Quantité"
              value={formatQuantity(detail.quantity, unitLabel(detail.unit))}
            />
            <DetailRow label="Montant estimé" value={money(detail.estimatedAmount)} />
            {detail.approvedAmount !== null && (
              <DetailRow label="Plafond accordé" value={money(detail.approvedAmount)} />
            )}
            {detail.paidAmount !== null && (
              <DetailRow label="Montant payé" value={money(detail.paidAmount)} />
            )}
            {Boolean(detail.reason) && <DetailRow label="Motif" value={detail.reason as string} />}
            <DetailRow label="Demandé par" value={detail.requestedByName ?? '—'} />
            {Boolean(detail.decidedByName) && (
              <DetailRow
                label={detail.status === 'rejected' ? 'Refusé par' : 'Approuvé par'}
                value={detail.decidedByName as string}
              />
            )}
            {Boolean(detail.decisionNote) && (
              <DetailRow label="Commentaire" value={detail.decisionNote as string} />
            )}
            {Boolean(detail.completedByName) && (
              <DetailRow label="Acheté par" value={detail.completedByName as string} />
            )}
            {Boolean(detail.expenseReference) && (
              <DetailRow label="Dépense" value={detail.expenseReference as string} />
            )}
          </>
        )}
      </Sheet>

      <ApproveSheet
        visible={approveOpen}
        request={detail}
        busy={busy}
        error={actionError}
        onClose={() => setApproveOpen(false)}
        onConfirm={(approvedAmount, note) =>
          detail &&
          void run(
            () => approvePurchase(detail.id, { approvedAmount, ...(note ? { note } : {}) }),
            'Demande approuvée',
          )
        }
      />

      <CompleteSheet
        visible={completeOpen}
        request={detail}
        busy={busy}
        error={actionError}
        onClose={() => setCompleteOpen(false)}
        onConfirm={(payload) =>
          detail && void run(() => completePurchase(detail.id, payload), 'Achat enregistré')
        }
      />

      <ConfirmSheet
        visible={rejectOpen}
        title="Refuser la demande"
        message="Le demandeur sera prévenu, avec votre motif."
        confirmLabel="Refuser"
        reasonLabel="Motif du refus"
        loading={busy}
        error={actionError}
        onCancel={() => setRejectOpen(false)}
        onConfirm={(note) =>
          detail && void run(() => rejectPurchase(detail.id, note), 'Demande refusée')
        }
      />

      <ConfirmSheet
        visible={cancelOpen}
        title="Annuler la demande"
        message="La demande sera retirée. Rien n’a encore été payé."
        confirmLabel="Annuler la demande"
        loading={busy}
        error={actionError}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() =>
          detail && void run(() => cancelPurchase(detail.id), 'Demande annulée')
        }
      />
    </View>
  );
}

function SummaryItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, tone ? { color: tone } : null]} numberOfLines={1}>
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

// -------------------------------------------------------------------------
// Nouvelle demande
// -------------------------------------------------------------------------

function NewRequestSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { currency, money, balance } = useWorkspace();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockItemId, setStockItemId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<string>('kg');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ product?: string; quantity?: string; amount?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStockItemId(null);
    setNewProduct(false);
    setNewName('');
    setNewUnit('kg');
    setQuantity('');
    setAmount('');
    setReason('');
    setErrors({});
    setError(null);
    listStock()
      .then((data) => {
        setStockItems(data.items);
        if (data.items.length === 0) setNewProduct(true);
      })
      .catch(() => undefined);
  }, [visible]);

  const selected = stockItems.find((item) => item.id === stockItemId);

  async function submit() {
    const qty = parseAmount(quantity) ?? 0;
    const estimated = parseAmount(amount) ?? 0;
    const next: typeof errors = {};
    if (newProduct ? newName.trim().length < 1 : !stockItemId) {
      next.product = newProduct ? 'Donnez le nom du produit.' : 'Choisissez le produit.';
    }
    if (qty <= 0) next.quantity = 'Indiquez la quantité.';
    if (estimated <= 0) next.amount = 'Indiquez le montant estimé.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      await createPurchase({
        ...(newProduct ? { itemName: newName.trim(), unit: newUnit } : { stockItemId: stockItemId as string }),
        quantity: qty,
        estimatedAmount: estimated,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Envoi impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Nouvelle demande d’achat"
      subtitle={`En caisse : ${money(balance)}`}
      error={error}
      onClose={onClose}
      actions={<Button label="Envoyer au gérant" onPress={submit} loading={saving} />}
    >
      <Text style={styles.blockLabel}>Produit</Text>
      {newProduct ? (
        <View style={styles.block}>
          <Field
            label="Nom du produit"
            value={newName}
            onChangeText={setNewName}
            placeholder="Huile de palme"
            error={errors.product}
          />
          <Text style={styles.blockLabel}>Unité</Text>
          <View style={styles.block}>
            <Chips
              options={STOCK_UNITS.map((value) => ({ value, label: UNIT_LABELS[value] ?? value }))}
              value={newUnit}
              onChange={setNewUnit}
            />
          </View>
          {stockItems.length > 0 && (
            <Pressable onPress={() => setNewProduct(false)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Choisir un produit du stock</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.block}>
          <Chips
            options={stockItems.map((item) => ({ value: item.id, label: item.name }))}
            value={stockItemId ?? ''}
            onChange={setStockItemId}
          />
          {Boolean(errors.product) && <Text style={styles.error}>{errors.product}</Text>}
          <Pressable
            onPress={() => {
              setNewProduct(true);
              setStockItemId(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Le produit n’est pas encore en stock</Text>
          </Pressable>
        </View>
      )}

      <AmountField
        label="Quantité"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="0"
        suffix={newProduct ? (UNIT_LABELS[newUnit] ?? newUnit) : unitLabel(selected?.unit ?? null)}
        error={errors.quantity}
      />
      <AmountField
        label="Montant estimé"
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
        suffix={currency.symbol}
        error={errors.amount}
        hint="Le gérant fixera le montant maximum que vous pourrez dépenser."
      />
      <Field
        label="Motif (facultatif)"
        value={reason}
        onChangeText={setReason}
        placeholder="Stock presque vide"
        multiline
      />
    </Sheet>
  );
}

// -------------------------------------------------------------------------
// Décision du gérant
// -------------------------------------------------------------------------

function ApproveSheet({
  visible,
  request,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  request: PurchaseRequest | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (approvedAmount: number, note: string) => void;
}) {
  const { currency, money, balance } = useWorkspace();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible || !request) return;
    setAmount(String(request.estimatedAmount));
    setNote('');
    setAmountError(undefined);
  }, [visible, request]);

  function submit() {
    const value = parseAmount(amount) ?? 0;
    if (value <= 0) {
      setAmountError('Indiquez le montant accordé.');
      return;
    }
    onConfirm(value, note.trim());
  }

  return (
    <Sheet
      visible={visible}
      title="Approuver la demande"
      subtitle={request ? `${request.itemName} · estimé ${money(request.estimatedAmount)}` : undefined}
      error={error}
      onClose={onClose}
      actions={<Button label="Approuver" onPress={submit} loading={busy} />}
    >
      <AmountField
        label="Montant maximum accordé"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          if (amountError) setAmountError(undefined);
        }}
        suffix={currency.symbol}
        error={amountError}
        hint={`L’achat ne pourra pas dépasser ce montant. En caisse : ${money(balance)}.`}
      />
      <Field
        label="Commentaire (facultatif)"
        value={note}
        onChangeText={setNote}
        placeholder="Prenez chez le fournisseur habituel"
        multiline
      />
    </Sheet>
  );
}

// -------------------------------------------------------------------------
// Achat réel
// -------------------------------------------------------------------------

function CompleteSheet({
  visible,
  request,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  request: PurchaseRequest | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payload: { amount: number; quantity: number; paymentMethod: string }) => void;
}) {
  const { currency, money } = useWorkspace();
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [payment, setPayment] = useState('cash');
  const [errors, setErrors] = useState<{ amount?: string; quantity?: string }>({});

  useEffect(() => {
    if (!visible || !request) return;
    setAmount('');
    setQuantity(String(request.quantity));
    setPayment('cash');
    setErrors({});
  }, [visible, request]);

  const ceiling = request?.approvedAmount ?? 0;

  function submit() {
    const value = parseAmount(amount) ?? 0;
    const qty = parseAmount(quantity) ?? 0;
    const next: typeof errors = {};
    if (value <= 0) next.amount = 'Indiquez le montant réellement payé.';
    else if (value > ceiling) next.amount = `Au plus ${money(ceiling)}, le montant accordé.`;
    if (qty <= 0) next.quantity = 'Indiquez la quantité reçue.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onConfirm({ amount: value, quantity: qty, paymentMethod: payment });
  }

  return (
    <Sheet
      visible={visible}
      title="Enregistrer l’achat"
      subtitle={request ? `${request.itemName} · plafond ${money(ceiling)}` : undefined}
      error={error}
      onClose={onClose}
      actions={<Button label="Enregistrer l’achat" onPress={submit} loading={busy} />}
    >
      <Text style={styles.note}>
        Le montant sort de la caisse et la quantité reçue entre en stock, en une seule opération.
      </Text>
      <AmountField
        label="Montant payé"
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
        suffix={currency.symbol}
        error={errors.amount}
      />
      <AmountField
        label="Quantité reçue"
        value={quantity}
        onChangeText={setQuantity}
        suffix={unitLabel(request?.unit ?? null)}
        error={errors.quantity}
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
  },
  summaryValue: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 22,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  summaryHint: {
    ...typography.small,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textOnPrimary,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  detailValue: {
    ...typography.bodyStrong,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  blockLabel: {
    ...typography.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  block: {
    marginBottom: spacing.lg,
  },
  link: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  error: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  note: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
});
