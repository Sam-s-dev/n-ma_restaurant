import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { spacing } from '../../theme/layout';

interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Interrupteur avec son libellé. Toute la ligne est cliquable : sur un
 * téléphone, viser le petit bouton à droite fait rater une fois sur deux.
 */
export function ToggleRow({ label, hint, value, onChange, disabled }: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {Boolean(hint) && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    flex: 1,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  hint: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
    marginTop: 1,
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    backgroundColor: colors.border,
  },
  trackOn: {
    backgroundColor: colors.primary,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  knobOn: {
    transform: [{ translateX: 18 }],
  },
});
