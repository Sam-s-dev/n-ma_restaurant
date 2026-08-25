import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { AreaChart } from '../../components/charts/AreaChart';
import { BarChart } from '../../components/charts/BarChart';
import { ChartCard } from '../../components/charts/ChartCard';
import { DonutChart } from '../../components/charts/DonutChart';
import { RankBars } from '../../components/charts/RankBars';
import { paletteAt } from '../../components/charts/chartTheme';
import { Segmented } from '../../components/workspace/Chips';
import { ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { StatCard } from '../../components/workspace/StatCard';
import { Pulse, Reveal, useCountUp } from '../../components/workspace/Motion';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { ApiError } from '../../api/client';
import { fetchCharts, fetchSummary } from '../../api/workspace/dashboard';
import type { DashboardCharts, DashboardSummary } from '../../api/workspace/dashboard';
import { EXPENSE_SHORT_LABELS } from '../../api/workspace/expenses';
import type { ExpenseCategory } from '../../api/workspace/expenses';
import { PAYMENT_LABELS } from '../../api/workspace/sales';
import { UNIT_LABELS } from '../../api/workspace/stock';
import { formatCompact, formatQuantity } from '../../utils/money';
import { WEEKDAYS_SHORT, formatDayShort, formatWeekdayDate, todayISO } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

type Period = '7' | '14' | '30';

const PERIODS = [
  { value: '7' as const, label: '7 jours' },
  { value: '14' as const, label: '14 jours' },
  { value: '30' as const, label: '30 jours' },
];

/**
 * Écran d'accueil de l'espace restaurant (§10).
 *
 * Toutes les valeurs viennent de la base : le résumé pour les chiffres du
 * jour et du mois, `/dashboard/charts` pour les six séries. Rien n'est
 * simulé — un restaurant qui n'a pas encore vendu voit des graphiques à
 * zéro et un encadré « premiers pas », pas de fausses courbes.
 */
export function DashboardScreen() {
  const { money, navigate } = useWorkspace();
  const [period, setPeriod] = useState<Period>('14');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (days: number) => {
      setError(null);
      try {
        const [nextSummary, nextCharts] = await Promise.all([fetchSummary(), fetchCharts(days)]);
        setSummary(nextSummary);
        setCharts(nextCharts);
      } catch (cause) {
        setError(
          cause instanceof ApiError ? cause.message : 'Impossible de charger le tableau de bord.',
        );
      }
    },
    [],
  );

  useEffect(() => {
    void load(Number(period));
  }, [load, period]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load(Number(period)).finally(() => setRefreshing(false));
  }, [load, period]);

  const countUp = useCountUp(summary?.today.sales ?? 0);

  const revenueTotal = useMemo(
    () => charts?.daily.reduce((sum, point) => sum + point.revenue, 0) ?? 0,
    [charts],
  );
  const expensesTotal = useMemo(
    () => charts?.daily.reduce((sum, point) => sum + point.expenses, 0) ?? 0,
    [charts],
  );

  if (!summary || !charts) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <ErrorState message={error} onRetry={() => void load(Number(period))} />
        ) : (
          <LoadingState label="Chargement de vos chiffres…" />
        )}
      </ScrollView>
    );
  }

  const netToday = summary.today.net;
  // Le chiffre grimpe : on voit que la vente qu'on vient de saisir l'a bougé.
  const animatedSales = Math.round(countUp);
  const hasActivity = revenueTotal > 0 || expensesTotal > 0 || summary.cash.totalIn > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
      }
    >
      {/* --- Journée en cours ------------------------------------------- */}
      <Reveal index={0}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDarker]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroCaption}>Recette du jour</Text>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {money(animatedSales)}
            </Text>
          </View>

          <View style={styles.heroBadge}>
            <Icon
              name={netToday >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={colors.textOnPrimary}
              strokeWidth={2.3}
            />
            <Text style={styles.heroBadgeText} numberOfLines={1}>
              {money(netToday)}
            </Text>
          </View>
        </View>

        <Text style={styles.heroDate}>{formatWeekdayDate(todayISO())}</Text>

        <View style={styles.heroStats}>
          <HeroStat label="Tickets" value={String(summary.today.salesCount)} />
          <View style={styles.heroSeparator} />
          <HeroStat label="Dépenses" value={money(summary.today.expenses)} />
          <View style={styles.heroSeparator} />
          <HeroStat label="Ce mois" value={money(summary.month.sales)} />
        </View>
      </LinearGradient>
      </Reveal>

      {/* --- Premiers pas ----------------------------------------------- */}
      {!hasActivity && (
        <Card style={styles.onboarding}>
          <Text style={[typography.h3, styles.onboardingTitle]}>Vos graphiques attendent</Text>
          <Text style={styles.onboardingText}>
            Ils se rempliront tout seuls à mesure que vous travaillez. Il suffit de commencer.
          </Text>

          <View style={styles.steps}>
            <OnboardingStep
              index={1}
              label="Créez vos plats"
              done={summary.menu.dishes > 0}
              onPress={() => navigate('menu')}
            />
            <OnboardingStep
              index={2}
              label="Enregistrez une vente"
              done={summary.today.salesCount > 0}
              onPress={() => navigate('sales')}
            />
            <OnboardingStep
              index={3}
              label="Notez vos dépenses"
              done={summary.month.expenses > 0}
              onPress={() => navigate('expenses')}
            />
          </View>
        </Card>
      )}

      {/* --- Indicateurs ------------------------------------------------- */}
      <Reveal index={1} style={styles.grid}>
        <StatCard
          icon="wallet"
          label="Solde de caisse"
          value={money(summary.cash.balance)}
          caption={`${money(summary.cash.totalIn)} encaissés`}
          tone={summary.cash.balance >= 0 ? 'positive' : 'negative'}
          onPress={() => navigate('cash')}
        />
        <StatCard
          icon="credit"
          label="Créances"
          value={money(summary.credits.totalOutstanding)}
          caption={`${summary.credits.openCount} en cours`}
          tone={summary.credits.totalOutstanding > 0 ? 'warning' : 'neutral'}
          onPress={() => navigate('credits')}
        />
      </Reveal>

      <Reveal index={2} style={styles.grid}>
        <StatCard
          icon="box"
          label="Valeur du stock"
          value={money(summary.stock.totalValue)}
          caption={
            summary.stock.lowCount > 0
              ? `${summary.stock.lowCount} produit(s) bas`
              : 'Aucune alerte'
          }
          tone={summary.stock.lowCount > 0 ? 'warning' : 'neutral'}
          onPress={() => navigate('stock')}
        />
        <StatCard
          icon="users"
          label="Salaires dus"
          value={money(summary.staff.salaryBalanceDue)}
          caption={`${summary.staff.presentToday}/${summary.staff.employees} présents`}
          tone={summary.staff.salaryBalanceDue > 0 ? 'warning' : 'neutral'}
          onPress={() => navigate('staff')}
        />
      </Reveal>

      {/* --- Période ----------------------------------------------------- */}
      <View style={styles.periodRow}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      {/* --- Recette et dépenses ---------------------------------------- */}
      <Reveal index={3}>
      <ChartCard
        title="Recette et dépenses"
        subtitle="Touchez la courbe pour lire un jour"
        highlight={money(revenueTotal)}
        highlightTone={revenueTotal >= expensesTotal ? 'positive' : 'negative'}
        footer={
          <View style={styles.legendRow}>
            <LegendDot color={colors.primary} label="Recette" value={money(revenueTotal)} />
            <LegendDot color={colors.iconAmber} label="Dépenses" value={money(expensesTotal)} />
          </View>
        }
      >
        <AreaChart
          labels={charts.daily.map((point) => formatDayShort(point.day))}
          formatValue={money}
          series={[
            {
              label: 'Recette',
              color: colors.primary,
              filled: true,
              values: charts.daily.map((point) => point.revenue),
            },
            {
              label: 'Dépenses',
              color: colors.iconAmber,
              dashed: true,
              values: charts.daily.map((point) => point.expenses),
            },
          ]}
        />
      </ChartCard>
      </Reveal>

      {/* --- Heures de pointe -------------------------------------------- */}
      <Reveal index={4}>
      <ChartCard
        title="Heures de pointe"
        subtitle="Quand vos clients passent commande"
        highlight={`${charts.hourly.reduce((sum, point) => sum + point.count, 0)} tickets`}
      >
        <BarChart
          data={charts.hourly.map((point) => ({
            label: `${point.hour}h`,
            value: point.revenue,
            caption: `${point.count} ticket${point.count > 1 ? 's' : ''}`,
          }))}
          formatValue={money}
          labelEvery={4}
          height={160}
        />
      </ChartCard>
      </Reveal>

      {/* --- Jours de la semaine ----------------------------------------- */}
      <Reveal index={5}>
      <ChartCard
        title="Vos meilleurs jours"
        subtitle="Recette cumulée par jour de la semaine"
      >
        <BarChart
          data={charts.weekday.map((point) => ({
            label: WEEKDAYS_SHORT[point.weekday - 1] ?? '',
            value: point.revenue,
            caption: `${point.count} ticket${point.count > 1 ? 's' : ''}`,
          }))}
          formatValue={money}
          color={colors.iconPurple}
          height={150}
        />
      </ChartCard>
      </Reveal>

      {/* --- Modes de règlement ------------------------------------------ */}
      <Reveal index={6}>
      <ChartCard
        title="Comment vos clients paient"
        subtitle="Part de chaque mode de règlement"
      >
        <DonutChart
          centerCaption="Total ventes"
          formatValue={(value) => formatCompact(value)}
          slices={charts.paymentMix.map((slice, index) => ({
            label: PAYMENT_LABELS[slice.paymentMethod] ?? slice.paymentMethod,
            value: slice.total,
            color: paletteAt(index),
          }))}
          emptyLabel="Aucune vente sur la période."
        />
      </ChartCard>
      </Reveal>

      {/* --- Postes de dépense ------------------------------------------- */}
      <Reveal index={7}>
      <ChartCard title="Où part l’argent" subtitle="Dépenses par poste">
        <DonutChart
          centerCaption="Total dépenses"
          formatValue={(value) => formatCompact(value)}
          slices={charts.expensesByCategory.map((slice, index) => ({
            label: EXPENSE_SHORT_LABELS[slice.category as ExpenseCategory] ?? slice.category,
            value: slice.total,
            color: paletteAt(index + 1),
          }))}
          emptyLabel="Aucune dépense sur la période."
        />
      </ChartCard>
      </Reveal>

      {/* --- Plats vedettes ----------------------------------------------- */}
      <Reveal index={8}>
      <ChartCard title="Vos plats vedettes" subtitle="Classés par chiffre d’affaires">
        <RankBars
          items={charts.topDishes.map((dish) => ({
            label: dish.dishName,
            value: dish.revenue,
            caption: `${formatQuantity(dish.quantity)} vendu(s)`,
          }))}
          formatValue={money}
        />
      </ChartCard>
      </Reveal>

      {/* --- Alertes ------------------------------------------------------ */}
      {charts.lowStock.length > 0 && (
        <Reveal index={9}>
        <Card style={styles.alertCard}>
          <SectionHeader
            title="Stock à surveiller"
            caption="Produits sous leur seuil d’alerte"
            action={
              <Pressable onPress={() => navigate('stock')} hitSlop={8}>
                <Text style={styles.link}>Voir</Text>
              </Pressable>
            }
          />
          {charts.lowStock.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <RowDivider />}
              <ListRow
                icon="alert"
                iconColor={colors.iconAmber}
                iconBackground={colors.pastelAmber}
                title={item.name}
                subtitle={`Seuil : ${formatQuantity(item.alertThreshold, UNIT_LABELS[item.unit] ?? item.unit)}`}
                value={formatQuantity(item.quantity, UNIT_LABELS[item.unit] ?? item.unit)}
                valueTone={item.quantity <= 0 ? 'negative' : 'neutral'}
              />
            </View>
          ))}
        </Card>
        </Reveal>
      )}

      {charts.topDebtors.length > 0 && (
        <Reveal index={10}>
        <Card style={styles.alertCard}>
          <SectionHeader
            title="Qui vous doit de l’argent"
            caption="Créances en cours, les plus élevées"
            action={
              <Pressable onPress={() => navigate('credits')} hitSlop={8}>
                <Text style={styles.link}>Voir</Text>
              </Pressable>
            }
          />
          {charts.topDebtors.map((debtor, index) => (
            <View key={debtor.id}>
              {index > 0 && <RowDivider />}
              <ListRow
                initials={initialsOf(debtor.fullName)}
                iconColor={colors.iconBlue}
                iconBackground={colors.pastelBlue}
                title={debtor.fullName}
                subtitle={debtor.phone ?? 'Numéro non renseigné'}
                value={money(debtor.totalDue)}
                valueTone="negative"
              />
            </View>
          ))}
        </Card>
        </Reveal>
      )}
    </ScrollView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

interface OnboardingStepProps {
  index: number;
  label: string;
  done: boolean;
  onPress: () => void;
}

function OnboardingStep({ index, label, done, onPress }: OnboardingStepProps) {
  return (
    <Pressable onPress={onPress} style={styles.step} accessibilityRole="button">
      <View style={[styles.stepBullet, done && styles.stepBulletDone]}>
        {done ? (
          <Icon name="check" size={13} color={colors.textOnPrimary} strokeWidth={2.6} />
        ) : (
          <Text style={styles.stepIndex}>{index}</Text>
        )}
      </View>
      <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{label}</Text>
      <Icon name="chevron-right" size={15} color={colors.textTertiary} strokeWidth={2.3} />
    </Pressable>
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
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
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
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: 150,
  },
  heroBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textOnPrimary,
  },
  heroDate: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroStat: {
    flex: 1,
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
    marginTop: 1,
  },
  heroSeparator: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: spacing.md,
  },
  onboarding: {
    marginBottom: spacing.lg,
  },
  onboardingTitle: {
    fontSize: 16,
  },
  onboardingText: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },
  steps: {
    marginTop: spacing.lg,
    gap: 2,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBulletDone: {
    backgroundColor: colors.success,
  },
  stepIndex: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  stepLabel: {
    ...typography.bodyStrong,
    flex: 1,
    fontSize: 14,
  },
  stepLabelDone: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  periodRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legendItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  legendValue: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  alertCard: {
    marginBottom: spacing.lg,
  },
  link: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
});
