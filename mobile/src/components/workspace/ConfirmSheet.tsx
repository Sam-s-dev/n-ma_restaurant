import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { Field } from './Field';
import { Sheet } from './Sheet';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/layout';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Demande un motif, conservé par le backend (annulations). */
  reasonLabel?: string;
  reasonMinLength?: number;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Confirmation d'une action irréversible, avec motif facultatif ou exigé.
 *
 * Les annulations (vente, dépense, salaire) réclament un motif : il apparaît
 * dans le grand livre à côté de l'écriture de contre-passation, et permet de
 * comprendre plus tard pourquoi la caisse a bougé.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  reasonLabel,
  reasonMinLength = 3,
  loading = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmSheetProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  // Le champ repart vide à chaque ouverture : sinon le motif d'une
  // annulation précédente resterait affiché.
  useEffect(() => {
    if (visible) {
      setReason('');
      setTouched(false);
    }
  }, [visible]);

  const tooShort = Boolean(reasonLabel) && reason.trim().length < reasonMinLength;

  function confirm() {
    setTouched(true);
    if (tooShort) return;
    onConfirm(reason.trim());
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      error={error ?? null}
      onClose={onCancel}
      actions={
        <>
          <Button label={confirmLabel} onPress={confirm} loading={loading} />
          <Button label="Annuler" onPress={onCancel} variant="ghost" />
        </>
      }
    >
      <Text style={styles.message}>{message}</Text>

      {Boolean(reasonLabel) && (
        <View style={styles.field}>
          <Field
            label={reasonLabel as string}
            value={reason}
            onChangeText={setReason}
            placeholder="Expliquez brièvement"
            multiline
            error={touched && tooShort ? `Au moins ${reasonMinLength} caractères.` : undefined}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  message: {
    ...typography.body,
    color: colors.textSecondary,
  },
  field: {
    marginTop: spacing.xl,
  },
});
