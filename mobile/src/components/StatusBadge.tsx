import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, spacing } from '../theme/layout';
import type { RestaurantStatus } from '../api/superadmin';

const STATUS: Record<
  RestaurantStatus,
  { label: string; background: string; accent: string }
> = {
  pending: { label: 'En attente', background: colors.warningSoft, accent: colors.warning },
  active: { label: 'Actif', background: colors.successSoft, accent: colors.success },
  disabled: { label: 'Désactivé', background: colors.dangerSoft, accent: colors.danger },
};

interface StatusBadgeProps {
  status: RestaurantStatus;
  /** Version compacte, sans pastille, pour les listes denses. */
  compact?: boolean;
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const style = STATUS[status];

  return (
    <View style={[styles.badge, { backgroundColor: style.background }, compact && styles.compact]}>
      {!compact && <View style={[styles.dot, { backgroundColor: style.accent }]} />}
      <Text style={[styles.label, { color: style.accent }]}>{style.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  compact: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.button,
    fontSize: 12,
    lineHeight: 16,
  },
});
