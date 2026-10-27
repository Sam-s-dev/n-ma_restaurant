import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { DepthPressable, Reveal } from '../../components/workspace/Motion';
import type { IconName } from '../../components/Icon';
import { fetchSummary } from '../../api/workspace/dashboard';
import type { DashboardSummary } from '../../api/workspace/dashboard';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, shadows, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';
import type { WorkspaceRoute } from './WorkspaceContext';
import { canOpen, tabRoutesFor } from './access';

interface ModuleTile {
  route: WorkspaceRoute;
  label: string;
  icon: IconName;
  background: string;
  color: string;
  caption: (summary: DashboardSummary | null, money: (value: number) => string) => string;
}

const MODULES: ModuleTile[] = [
  {
    route: 'stock',
    label: 'Stock',
    icon: 'box',
    background: colors.pastelAmber,
    color: colors.iconAmber,
    caption: (summary, money) =>
      summary
        ? `${money(summary.stock.totalValue)}${summary.stock.lowCount > 0 ? ` · ${summary.stock.lowCount} alerte(s)` : ''}`
        : 'Matières premières',
  },
  {
    route: 'expenses',
    label: 'Dépenses',
    icon: 'receipt',
    background: colors.pastelRed,
    color: colors.iconRed,
    caption: (summary, money) =>
      summary ? `${money(summary.month.expenses)} ce mois` : 'Sorties d’argent',
  },
  {
    route: 'staff',
    label: 'Personnel',
    icon: 'users',
    background: colors.pastelBlue,
    color: colors.iconBlue,
    caption: (summary) =>
      summary
        ? `${summary.staff.presentToday}/${summary.staff.employees} présent(s)`
        : 'Équipe et salaires',
  },
  {
    route: 'credits',
    label: 'Créances',
    icon: 'credit',
    background: colors.pastelPurple,
    color: colors.iconPurple,
    caption: (summary, money) =>
      summary ? `${money(summary.credits.totalOutstanding)} à recouvrer` : 'Ce qu’on vous doit',
  },
  {
    route: 'customers',
    label: 'Clients',
    icon: 'user',
    background: colors.pastelPink,
    color: colors.iconPink,
    caption: () => 'Carnet d’adresses',
  },
  {
    route: 'audit',
    label: 'Journal',
    icon: 'clock',
    background: colors.pastelGreen,
    color: colors.iconGreen,
    caption: () => 'Qui a fait quoi, et quand',
  },
  {
    route: 'settings',
    label: 'Paramètres',
    icon: 'settings',
    background: colors.backgroundAlt,
    color: colors.textSecondary,
    caption: () => 'Restaurant, équipe, compte',
  },
];

/**
 * Modules secondaires, regroupés pour tenir la barre d'onglets à cinq
 * entrées. Chaque tuile porte un chiffre à jour : le gérant voit d'un coup
 * d'œil ce qui réclame son attention.
 *
 * Seuls les modules ouverts au rôle apparaissent, et pas ceux qui ont
 * déjà leur onglet.
 */
export function MoreScreen() {
  const { profile, can, money, navigate } = useWorkspace();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const tabs = tabRoutesFor(profile);
  const modules = MODULES.filter(
    (module) => canOpen(profile, module.route) && !tabs.includes(module.route),
  );
  const withFigures = can('dashboard.view');

  const load = useCallback(async () => {
    if (!withFigures) return;
    await fetchSummary()
      .then(setSummary)
      .catch(() => undefined);
  }, [withFigures]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
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
      <Text style={[typography.h1, styles.title]}>Vos modules</Text>
      <Text style={styles.subtitle}>
        Tout ce qui ne se fait pas pendant le service, rassemblé au même endroit.
      </Text>

      <View style={styles.grid}>
        {modules.map((module, index) => (
          <Reveal key={module.route} index={index} style={styles.tileSlot}>
            <DepthPressable
              onPress={() => navigate(module.route)}
              accessibilityLabel={module.label}
              style={styles.tile}
            >
              <View style={[styles.tileIcon, { backgroundColor: module.background }]}>
                <Icon name={module.icon} size={20} color={module.color} />
              </View>
              <Text style={styles.tileLabel}>{module.label}</Text>
              <Text style={styles.tileCaption} numberOfLines={2}>
                {module.caption(summary, money)}
              </Text>
            </DepthPressable>
          </Reveal>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  title: {
    fontSize: 23,
    lineHeight: 30,
  },
  subtitle: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tileSlot: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    maxWidth: 240,
  },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.soft,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  tileLabel: {
    ...typography.bodyStrong,
    fontSize: 15,
    lineHeight: 21,
  },
  tileCaption: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
    marginTop: 1,
  },
});
