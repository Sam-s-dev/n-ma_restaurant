import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from './Button';
import { colors } from '../theme/colors';
import { fontFamily, typography } from '../theme/typography';
import { radius, shadows, spacing } from '../theme/layout';

interface PromptModalProps {
  visible: boolean;
  title: string;
  message: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  /** Longueur minimale exigée ; 0 rend la saisie facultative. */
  minLength?: number;
  destructive?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

/**
 * Demande une saisie avant une action sensible — le motif d'une
 * désactivation, par exemple, que le backend exige et conserve pour
 * l'afficher au gérant concerné.
 */
export function PromptModal({
  visible,
  title,
  message,
  label,
  placeholder,
  confirmLabel,
  minLength = 0,
  destructive = false,
  loading = false,
  onCancel,
  onConfirm,
}: PromptModalProps) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  // Le champ repart vide à chaque ouverture : sans cela, le motif d'un
  // restaurant précédent resterait affiché.
  useEffect(() => {
    if (visible) {
      setValue('');
      setTouched(false);
    }
  }, [visible]);

  const tooShort = value.trim().length < minLength;
  const showError = touched && tooShort;

  function confirm() {
    setTouched(true);
    if (tooShort) return;
    onConfirm(value.trim());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Le fond sombre ferme la fenêtre, comportement attendu sur mobile. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Fermer" />

        <View style={styles.sheet}>
          <Text style={[typography.h2, styles.title]}>{title}</Text>
          <Text style={[typography.small, styles.message]}>{message}</Text>

          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={[styles.input, showError && styles.inputError]}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            autoFocus
          />
          {showError && (
            <Text style={styles.error}>
              {minLength > 0 ? `Au moins ${minLength} caractères.` : 'Champ requis.'}
            </Text>
          )}

          <View style={styles.actions}>
            <Button
              label={confirmLabel}
              onPress={confirm}
              loading={loading}
              variant={destructive ? 'primary' : 'primary'}
            />
            <Button label="Annuler" onPress={onCancel} variant="ghost" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(12, 8, 6, 0.55)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    ...shadows.large,
  },
  title: {
    marginBottom: spacing.xs,
  },
  message: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  input: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 88,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  error: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
});
