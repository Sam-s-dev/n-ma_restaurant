import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Montant ou quantité, aligné à droite. */
  value?: string;
  valueTone?: 'neutral' | 'positive' | 'negative' | 'muted';
  valueCaption?: string;
  icon?: IconName;
  iconColor?: string;
  iconBackground?: string;
  /** Initiales à la place de l'icône (employés, clients). */
  initials?: string;
  badge?: React.ReactNode;
  /** Lignes accordées au sous-titre avant troncature (une par défaut). */
  subtitleLines?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Ligne de liste unique à toute l'application : un visuel à gauche, deux
 * lignes de texte, une valeur à droite. Uniformiser ce motif évite que
 * chaque module invente sa propre mise en page.
 */
export function ListRow({
  title,
  subtitle,
  value,
  valueTone = 'neutral',
  valueCaption,
  icon,
  iconColor = colors.textSecondary,
  iconBackground = colors.backgroundAlt,
  initials,
  badge,
  subtitleLines = 1,
  onPress,
  style,
}: ListRowProps) {
  const tone =
    valueTone === 'positive'
      ? colors.success
      : valueTone === 'negative'
        ? colors.danger
        : valueTone === 'muted'
          ? colors.textTertiary
          : colors.textPrimary;

  const content = (
    <>
      {(icon || initials) && (
        <View style={[styles.leading, { backgroundColor: iconBackground }]}>
          {initials ? (
            <Text style={[styles.initials, { color: iconColor }]}>{initials}</Text>
          ) : (
            <Icon name={icon as IconName} size={18} color={iconColor} />
          )}
        </View>
      )}

      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {badge}
        </View>
        {Boolean(subtitle) && (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        )}
      </View>

      {Boolean(value) && (
        <View style={styles.valueBlock}>
          <Text style={[styles.value, { color: tone }]} numberOfLines={1}>
            {value}
          </Text>
          {Boolean(valueCaption) && (
            <Text style={styles.valueCaption} numberOfLines={1}>
              {valueCaption}
            </Text>
          )}
        </View>
      )}

      {Boolean(onPress) && (
        <Icon name="chevron-right" size={16} color={colors.textTertiary} strokeWidth={2.4} />
      )}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, style]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

/** Séparateur d'une épaisseur de pixel physique, entre deux lignes. */
export function RowDivider() {
  return <View style={styles.divider} />;
}

interface SectionHeaderProps {
  title: string;
  caption?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, caption, action }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTexts}>
        <Text style={[typography.h3, styles.sectionTitle]}>{title}</Text>
        {Boolean(caption) && <Text style={styles.sectionCaption}>{caption}</Text>}
      </View>
      {action}
    </View>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.textTertiary} strokeWidth={1.8} />
      </View>
      <Text style={[typography.h3, styles.emptyTitle]}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {Boolean(action) && <View style={styles.emptyAction}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
  leading: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 19,
  },
  texts: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  subtitle: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
    marginTop: 1,
  },
  valueBlock: {
    alignItems: 'flex-end',
  },
  value: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
  },
  valueCaption: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTexts: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  sectionCaption: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  emptyAction: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
});
