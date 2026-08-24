import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/layout';

/**
 * Attente du premier chargement.
 *
 * Le message compte : sur l'offre gratuite de Render, le serveur s'endort
 * et la première requête peut prendre une trentaine de secondes. Sans
 * explication, l'utilisateur croit l'application plantée.
 */
export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.center}>
      <View style={styles.icon}>
        <Icon name="alert" size={24} color={colors.danger} strokeWidth={1.9} />
      </View>
      <Text style={[typography.h3, styles.title]}>Chargement impossible</Text>
      <Text style={styles.message}>{message}</Text>
      {Boolean(onRetry) && (
        <View style={styles.action}>
          <Button label="Réessayer" onPress={onRetry as () => void} variant="secondary" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.lg,
  },
  label: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  icon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 16,
    textAlign: 'center',
  },
  message: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.xl,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
});
