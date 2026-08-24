import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { maxButtonWidth, radius, shadows, spacing } from '../theme/layout';

type Variant = 'primary' | 'secondary' | 'ghost' | 'light';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  /** Occupe toute la largeur disponible. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Bouton en pilule, décliné en quatre styles. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  block = true,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = VARIANTS[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        block && styles.block,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : 1.5,
        },
        variant === 'primary' && !isDisabled && shadows.primaryButton,
        // Retour tactile : l'enfoncement remplace un effet de survol absent sur mobile.
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} size="small" />
      ) : (
        <View style={styles.content}>
          <Text style={[typography.button, { color: palette.text }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { background: string; text: string; border: string }> = {
  primary: {
    background: colors.primary,
    text: colors.textOnPrimary,
    border: 'transparent',
  },
  secondary: {
    background: 'transparent',
    text: colors.primary,
    border: colors.primary,
  },
  ghost: {
    background: 'transparent',
    text: colors.textSecondary,
    border: 'transparent',
  },
  /** Posé sur la photo du hero : fond blanc, texte sombre. */
  light: {
    background: colors.surface,
    text: colors.textPrimary,
    border: 'transparent',
  },
};

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  block: {
    alignSelf: 'stretch',
    // Un bouton ne s'étire jamais au-delà de cette largeur : sur navigateur
    // il resterait sinon aussi large que la fenêtre.
    maxWidth: maxButtonWidth,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.975 }],
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.5,
  },
});
