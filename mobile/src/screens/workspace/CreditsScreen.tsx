import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chips } from '../../components/workspace/Chips';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import { CREDIT_STATUS_LABELS, getCredit, listCredits, repayCredit } from '../../api/workspace/credits';
import type { Credit, CreditDetail, CreditStatus, CreditsPage } from '../../api/workspace/credits';
import { PAYMENT_LABELS } from '../../api/workspace/sales';
import { parseAmount } from '../../utils/money';
import { daysOverdue, formatDateTime, formatRelativeDay } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const FILTERS = [
  { value: 'open' as const, label: 'En cours' },
  { value: 'paid' as const, label: 'Soldées' },
  { value: 'all' as const, label: 'Toutes' },
];

/**
 * §8 — Créances.
 *
 * Un remboursement fait deux choses en une transaction : il diminue la
 * dette du client et fait entrer l'argent en caisse (§7, §10). Le statut
 * de la créance est recalculé côté base, jamais côté écran.
 */
export function CreditsScreen() {
  const { money, refreshBalance, notify } = useWorkspace();

  const [filter, setFilter] = useState<'open' | 'paid' | 'all'>('open');
  const [page, setPage] = useState<CreditsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CreditDetail | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(
        await listCredits({
          limit: 60,
          ...(filter === 'open'
            ? { onlyOpen: true }
            : filter === 'paid'
              ? { status: 'paid' as CreditStatus }
              : { onlyOpen: false }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des créances impossible.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function open(credit: Credit) {
    try {
      setSelected(await getCredit(credit.id));
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Ouverture impossible.', 'danger');
    }
  }

  if (loading) return <LoadingState label="Chargement des créances…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const credits = page?.items ?? [];

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
        <LinearGradient
          colors={[colors.iconPurple, '#5B3FD1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroCaption}>Total à recouvrer</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {money(page?.totalOutstanding ?? 0)}
          </Text>
          <Text style={styles.heroHint}>
            Cet argent n’est pas en caisse : il est chez vos clients.
          </Text>
        </LinearGradient>

        <View style={styles.filters}>
          <Chips bleed={screenPadding} options={FILTERS} value={filter} onChange={setFilter} />
        </View>

        {credits.length === 0 ? (
          <EmptyState
            icon="credit"
            title={filter === 'open' ? 'Aucune créance en cours' : 'Aucune créance'}
            message="Une vente enregistrée en « Crédit » ouvre automatiquement une créance au nom du client."
          />
        ) : (
          <Card>
            {credits.map((credit, index) => {
              const late = credit.dueDate ? daysOverdue(credit.dueDate) > 0 : false;

              return (
                <View key={credit.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    initials={initialsOf(credit.customerName)}
                    iconColor={late ? colors.iconRed : colors.iconPurple}
                    iconBackground={late ? colors.pastelRed : colors.pastelPurple}
                    title={credit.customerName}
                    subtitle={`${credit.saleReference} · ${
                      credit.dueDate
                        ? `échéance ${formatRelativeDay(credit.dueDate)}`
                        : `ouverte le ${formatRelativeDay(credit.openedAt.slice(0, 10))}`
                    }`}
                    value={money(credit.amountLeft)}
                    valueTone={credit.amountLeft > 0 ? 'negative' : 'positive'}
                    valueCaption={
                      late ? 'En retard' : CREDIT_STATUS_LABELS[credit.status] ?? credit.status
                    }
                    onPress={() => void open(credit)}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <RepaySheet
        credit={selected}
        onClose={() => setSelected(null)}
        onPaid={() => {
          setSelected(null);
          refreshBalance();
          notify('Remboursement encaissé');
          void load();
        }}
      />
    </View>
  );
}

interface RepaySheetProps {
  credit: CreditDetail | null;
  onClose: () => void;
  onPaid: () => void;
}

function RepaySheet({ credit, onClose, onPaid }: RepaySheetProps) {
  const { money, currency } = useWorkspace();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!credit) return;
    // Pré-rempli au solde restant : le cas le plus fréquent est le
    // remboursement intégral.
    setAmount(credit.amountLeft > 0 ? String(credit.amountLeft) : '');
    setMethod('cash');
    setNote('');
    setAmountError(undefined);
    setError(null);
  }, [credit]);

  async function submit() {
    if (!credit) return;
    const value = parseAmount(amount);
    if (value === null || value <= 0) {
      setAmountError('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (value > credit.amountLeft) {
      setAmountError(`Le solde restant est de ${money(credit.amountLeft)}.`);
      return;
    }

    setAmountError(undefined);
    setSaving(true);
    setError(null);
    try {
      await repayCredit(credit.id, {
        amount: value,
        paymentMethod: method,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onPaid();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  const settled = credit ? credit.amountLeft <= 0 : false;

  return (
    <Sheet
      visible={Boolean(credit)}
      title={credit?.customerName ?? ''}
      subtitle={credit ? `${credit.saleReference} · ${credit.customerPhone ?? 'sans téléphone'}` : undefined}
      error={error}
      onClose={onClose}
      actions={
        settled ? (
          <Button label="Fermer" onPress={onClose} variant="secondary" />
        ) : (
          <Button label="Encaisser le remboursement" onPress={submit} loading={saving} />
        )
      }
    >
      {credit && (
        <>
          <View style={styles.recap}>
            <View style={styles.recapRow}>
              <RecapItem label="Dû au départ" value={money(credit.amountDue)} />
              <RecapItem label="Déjà payé" value={money(credit.amountPaid)} tone={colors.success} />
              <RecapItem
                label="Reste"
                value={money(credit.amountLeft)}
                tone={credit.amountLeft > 0 ? colors.danger : colors.success}
              />
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      credit.amountDue > 0
                        ? Math.min(100, (credit.amountPaid / credit.amountDue) * 100)
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
          </View>

          {!settled && (
            <>
              <AmountField
                label="Montant reçu"
                value={amount}
                onChangeText={(value) => {
                  setAmount(value);
                  if (amountError) setAmountError(undefined);
                }}
                placeholder="0"
                suffix={currency.symbol}
                error={amountError}
                hint={`Maximum : ${money(credit.amountLeft)}`}
              />

              <Text style={styles.blockLabel}>Mode de règlement</Text>
              <View style={styles.spaced}>
                <Chips
                  options={[
                    { value: 'cash', label: 'Espèces' },
                    { value: 'mobile_money', label: 'Mobile Money' },
                    { value: 'card', label: 'Carte' },
                    { value: 'bank_transfer', label: 'Virement' },
                  ]}
                  value={method}
                  onChange={setMethod}
                />
              </View>

              <Field
                label="Note (facultatif)"
                value={note}
                onChangeText={setNote}
                placeholder="Payé en deux fois"
              />
            </>
          )}

          {credit.payments.length > 0 && (
            <>
              <SectionHeader
                title="Remboursements"
                caption={`${credit.payments.length} versement(s)`}
              />
              {credit.payments.map((payment, index) => (
                <View key={payment.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    icon="wallet"
                    iconColor={colors.iconGreen}
                    iconBackground={colors.pastelGreen}
                    title={money(payment.amount)}
                    subtitle={`${formatDateTime(payment.paidAt)} · ${
                      PAYMENT_LABELS[payment.paymentMethod] ?? payment.paymentMethod
                    }`}
                  />
                </View>
              ))}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function RecapItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.recapItem}>
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={[styles.recapValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroCaption: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.78)',
  },
  heroValue: {
    fontFamily: fontFamily.bold,
    fontSize: 29,
    lineHeight: 37,
    letterSpacing: -0.6,
    color: colors.textOnPrimary,
    marginTop: 2,
  },
  heroHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: spacing.sm,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  recap: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  recapRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  recapItem: {
    flex: 1,
  },
  recapLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  recapValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: 1,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  blockLabel: {
    ...typography.bodyStrong,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  spaced: {
    marginBottom: spacing.lg,
  },
});
