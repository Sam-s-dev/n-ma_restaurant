import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, spacing } from '../theme/layout';

export type BannerTone = 'danger' | 'warning' | 'success' | 'info';

interface BannerProps {
  tone: BannerTone;
  title?: string;
  message: string;
}

const TONES: Record<BannerTone, { background: string; accent: string }> = {
  danger: { background: colors.dangerSoft, accent: colors.danger },
  warning: { background: colors.warningSoft, accent: colors.warning },
  success: { background: colors.successSoft, accent: colors.success },
  info: { background: colors.infoSoft, accent: colors.info },
};

/**
 * Message contextuel affiché au-dessus d'un formulaire — sert notamment à
 * expliquer pourquoi une connexion est refusée (compte en attente ou
 * désactivé), plutôt qu'une alerte système qu'on referme sans lire.
 */
export function Banner({ tone, title, message }: BannerProps) {
  const palette = TONES[tone];

  return (
    <View
      accessibilityRole="alert"
      style={[styles.container, { backgroundColor: palette.background }]}
    >
      <View style={[styles.stripe, { backgroundColor: palette.accent }]} />
      <View style={styles.content}>
        {Boolean(title) && (
          <Text style={[styles.title, { color: palette.accent }]}>{title}</Text>
        )}
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  stripe: {
    width: 4,
  },
  content: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: 2,
  },
  message: {
    ...typography.small,
    color: colors.textPrimary,
  },
});
