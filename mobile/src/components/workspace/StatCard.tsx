import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, shadows, spacing } from '../../theme/layout';

interface StatCardProps {
  icon: IconName;
  label: string;
  value: string;
  caption?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
  onPress?: () => void;
}

const TONES = {
  neutral: { background: colors.pastelBlue, icon: colors.iconBlue, value: colors.textPrimary },
  positive: { background: colors.pastelGreen, icon: colors.iconGreen, value: colors.success },
  negative: { background: colors.pastelRed, icon: colors.iconRed, value: colors.danger },
  warning: { background: colors.pastelAmber, icon: colors.iconAmber, value: colors.warning },
} as const;

/**
 * Petite tuile chiffrée du tableau de bord. Deux par ligne : au-delà, la
 * valeur ne tient plus sur un écran de téléphone.
 */
export function StatCard({
  icon,
  label,
  value,
  caption,
  tone = 'neutral',
  onPress,
}: StatCardProps) {
  const palette = TONES[tone];

  const body = (
    <>
      <View style={[styles.icon, { backgroundColor: palette.background }]}>
        <Icon name={icon} size={17} color={palette.icon} />
      </View>

      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color: palette.value }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {Boolean(caption) && (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      )}
    </>
  );

  if (!onPress) return <View style={styles.card}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.75,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textTertiary,
  },
  value: {
    ...typography.h3,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 2,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
    marginTop: 1,
  },
});
