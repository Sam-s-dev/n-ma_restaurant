import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips, Segmented } from '../../components/workspace/Chips';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import { CATEGORY_LABELS, adjustCash, listMovements } from '../../api/workspace/cash';
import type { CashCategory, CashDirection, MovementsPage } from '../../api/workspace/cash';
import { PAYMENT_LABELS } from '../../api/workspace/sales';
import { parseAmount } from '../../utils/money';
import { formatDateTime } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const DIRECTIONS = [
  { value: 'all' as const, label: 'Tout' },
  { value: 'in' as const, label: 'Entrées' },
  { value: 'out' as const, label: 'Sorties' },
];

const CATEGORIES = [
  { value: 'all' as const, label: 'Toutes catégories' },
  { value: 'sale' as const, label: 'Ventes' },
  { value: 'credit_payment' as const, label: 'Remboursements' },
  { value: 'expense' as const, label: 'Dépenses' },
  { value: 'salary' as const, label: 'Salaires' },
  { value: 'adjustment' as const, label: 'Ajustements' },
];

/**
 * §7 — Caisse.
 *
 * Le grand livre est en ajout seul : rien ne se modifie ni ne s'efface.
 * Une erreur se corrige par un ajustement, qui laisse sa propre trace —
 * c'est ce qui rend le solde vérifiable ligne à ligne.
 */
export function CashScreen() {
  const { money, balance, refreshBalance, notify } = useWorkspace();

  const [direction, setDirection] = useState<'all' | CashDirection>('all');
  const [category, setCategory] = useState<'all' | CashCategory>('all');
  const [page, setPage] = useState<MovementsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(
        await listMovements({
          limit: 60,
          ...(direction === 'all' ? {} : { direction }),
          ...(category === 'all' ? {} : { category }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement de la caisse impossible.');
    } finally {
      setLoading(false);
    }
  }, [direction, category]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Chargement de la caisse…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const movements = page?.items ?? [];

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
              refreshBalance();
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={colors.primary}
          />
        }
      >
        <LinearGradient
          colors={[colors.iconGreen, '#1F7A45']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroCaption}>Solde disponible</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {money(balance)}
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Icon name="arrow-down" size={14} color="rgba(255,255,255,0.85)" strokeWidth={2.3} />
              <View>
                <Text style={styles.heroStatLabel}>Entrées</Text>
                <Text style={styles.heroStatValue} numberOfLines={1}>
                  {money(page?.totals.in ?? 0)}
                </Text>
              </View>
            </View>

            <View style={styles.heroSeparator} />

            <View style={styles.heroStat}>
              <Icon name="arrow-up" size={14} color="rgba(255,255,255,0.85)" strokeWidth={2.3} />
              <View>
                <Text style={styles.heroStatLabel}>Sorties</Text>
                <Text style={styles.heroStatValue} numberOfLines={1}>
                  {money(page?.totals.out ?? 0)}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <SectionHeader
          title="Mouvements"
          caption={`${page?.total ?? 0} écriture(s) · filtre en cours`}
        />

        <Segmented options={DIRECTIONS} value={direction} onChange={setDirection} />

        <View style={styles.categoryRow}>
          <Chips bleed={screenPadding} options={CATEGORIES} value={category} onChange={setCategory} />
        </View>

        {movements.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="Aucun mouvement"
            message="Chaque vente encaissée, dépense ou salaire viendra s’inscrire ici automatiquement."
          />
        ) : (
          <Card>
            {movements.map((movement, index) => {
              const incoming = movement.direction === 'in';
              return (
                <View key={movement.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    icon={incoming ? 'arrow-down' : 'arrow-up'}
                    iconColor={incoming ? colors.iconGreen : colors.iconRed}
                    iconBackground={incoming ? colors.pastelGreen : colors.pastelRed}
                    title={movement.label}
                    subtitle={`${formatDateTime(movement.occurredAt)} · ${
                      CATEGORY_LABELS[movement.category]
                    }${
                      movement.paymentMethod
                        ? ` · ${PAYMENT_LABELS[movement.paymentMethod] ?? movement.paymentMethod}`
                        : ''
                    }`}
                    value={`${incoming ? '+' : '−'} ${money(movement.amount)}`}
                    valueTone={incoming ? 'positive' : 'negative'}
                    valueCaption={movement.createdByName ?? undefined}
                  />
                </View>
              );
            })}
          </Card>
        )}

        <View style={styles.adjustAction}>
          <Button
            label="Corriger le solde"
            onPress={() => setAdjustOpen(true)}
            variant="secondary"
          />
          <Text style={styles.adjustHint}>
            Fonds de caisse initial, erreur de saisie : l’écriture s’ajoute, rien n’est effacé.
          </Text>
        </View>
      </ScrollView>

      <AdjustSheet
        visible={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onDone={() => {
          setAdjustOpen(false);
          refreshBalance();
          notify('Solde corrigé');
          void load();
        }}
      />
    </View>
  );
}

interface AdjustSheetProps {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

function AdjustSheet({ visible, onClose, onDone }: AdjustSheetProps) {
  const { currency } = useWorkspace();
  const [direction, setDirection] = useState<CashDirection>('in');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; label?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDirection('in');
      setAmount('');
      setLabel('');
      setErrors({});
      setError(null);
    }
  }, [visible]);

  async function submit() {
    const value = parseAmount(amount);
    const next: { amount?: string; label?: string } = {};
    if (value === null || value <= 0) next.amount = 'Saisissez un montant supérieur à zéro.';
    if (label.trim().length < 3) next.label = 'Décrivez la correction en quelques mots.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      await adjustCash({ direction, amount: value as number, label: label.trim() });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Correction impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Corriger le solde"
      subtitle="L’écriture apparaîtra dans le grand livre"
      error={error}
      onClose={onClose}
      actions={<Button label="Enregistrer" onPress={submit} loading={saving} />}
    >
      <Text style={styles.blockLabel}>Sens</Text>
      <Segmented
        options={[
          { value: 'in', label: 'Ajouter en caisse' },
          { value: 'out', label: 'Retirer de la caisse' },
        ]}
        value={direction}
        onChange={setDirection}
        style={styles.directionSwitch}
      />

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

      <Field
        label="Motif"
        value={label}
        onChangeText={(value) => {
          setLabel(value);
          if (errors.label) setErrors((prev) => ({ ...prev, label: undefined }));
        }}
        placeholder="Fonds de caisse du matin"
        error={errors.label}
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
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.6,
    color: colors.textOnPrimary,
    marginTop: 2,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroStatLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: 'rgba(255, 255, 255, 0.72)',
  },
  heroStatValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textOnPrimary,
  },
  heroSeparator: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: spacing.md,
  },
  categoryRow: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  adjustAction: {
    marginTop: spacing.xxl,
    alignItems: 'center',
  },
  adjustHint: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 340,
  },
  blockLabel: {
    ...typography.bodyStrong,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  directionSwitch: {
    marginBottom: spacing.xl,
  },
});
