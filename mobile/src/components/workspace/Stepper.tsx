import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Version compacte, utilisée dans les lignes du panier. */
  compact?: boolean;
}

/**
 * Compteur − / valeur / +. Sur un plan de travail de restaurant, taper une
 * quantité au clavier est plus lent que d'appuyer deux fois sur « + » ;
 * le clavier reste possible ailleurs, pour les quantités inhabituelles.
 */
export function Stepper({ value, onChange, min = 0, max = 999, compact = false }: StepperProps) {
  const size = compact ? 28 : 34;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel="Diminuer"
        style={[
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          value <= min && styles.disabled,
        ]}
      >
        <Icon name="minus" size={compact ? 14 : 16} color={colors.textPrimary} strokeWidth={2.4} />
      </Pressable>

      <Text style={[styles.value, compact && styles.valueCompact]}>{value}</Text>

      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel="Augmenter"
        style={[
          styles.button,
          styles.buttonPrimary,
          { width: size, height: size, borderRadius: size / 2 },
          value >= max && styles.disabled,
        ]}
      >
        <Icon name="plus" size={compact ? 14 : 16} color={colors.textOnPrimary} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.pill,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  disabled: {
    opacity: 0.4,
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: 'center',
  },
  valueCompact: {
    fontSize: 14,
    lineHeight: 19,
    minWidth: 22,
  },
});
