import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { colors } from '../theme/colors';
import { fontFamily, typography } from '../theme/typography';
import { radius, spacing } from '../theme/layout';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Message d'erreur affiché sous le champ. */
  error?: string | undefined;
  hint?: string;
  /** Affiche l'œil pour révéler le mot de passe. */
  revealable?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, revealable = false, secureTextEntry, ...inputProps },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isSecure = secureTextEntry && !revealed;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          Boolean(error) && styles.fieldError,
        ]}
      >
        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={isSecure}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          {...inputProps}
        />

        {revealable && secureTextEntry !== undefined && (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            <Text style={styles.reveal}>{revealed ? 'Masquer' : 'Afficher'}</Text>
          </Pressable>
        )}
      </View>

      {Boolean(error) && <Text style={styles.error}>{error}</Text>}
      {!error && Boolean(hint) && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  fieldFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    // Android ajoute un padding vertical par défaut qui décentre le texte.
    paddingVertical: spacing.md,
  },
  reveal: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  error: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.xs,
    marginLeft: spacing.lg,
  },
  hint: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginLeft: spacing.lg,
  },
});
