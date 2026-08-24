import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps, TextStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

/** Voir TextField : on retire le halo bleu que le navigateur ajoute au focus. */
const noBrowserOutline =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Suffixe affiché à droite (devise, unité de stock). */
  suffix?: string;
  multiline?: boolean;
}

/**
 * Champ de formulaire des feuilles modales.
 *
 * Plus compact et à coins moins arrondis que `TextField`, utilisé lui sur
 * les écrans d'accueil et de connexion : dans un formulaire de six lignes,
 * des champs en pilule mangent trop de hauteur.
 */
export function Field({ label, error, hint, suffix, multiline, ...inputProps }: FieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          Boolean(error) && styles.fieldError,
        ]}
      >
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline, noBrowserOutline]}
          placeholderTextColor={colors.textTertiary}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...inputProps}
        />
        {Boolean(suffix) && <Text style={styles.suffix}>{suffix}</Text>}
      </View>

      {Boolean(error) && <Text style={styles.error}>{error}</Text>}
      {!error && Boolean(hint) && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

/**
 * Saisie d'un montant. Le clavier numérique est imposé et la virgule
 * décimale acceptée : `parseAmount` s'occupe de la conversion.
 */
export function AmountField(props: FieldProps) {
  return (
    <Field
      keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
      inputMode="decimal"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  fieldMultiline: {
    minHeight: 84,
    paddingVertical: spacing.md,
    alignItems: 'flex-start',
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  inputMultiline: {
    minHeight: 60,
  },
  suffix: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textTertiary,
  },
  error: {
    ...typography.small,
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
  hint: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
});
