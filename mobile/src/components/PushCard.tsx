import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { pushStatus } from '../utils/push';
import type { PushStatus } from '../utils/push';
import { colors } from '../theme/colors';
import { fontFamily, typography } from '../theme/typography';
import { radius, spacing } from '../theme/layout';

interface PushCardProps {
  /** Ce que le message apportera, dit à la personne concernée. */
  message: string;
  onEnable: () => Promise<PushStatus>;
  /** Invitation refermable (accueil) ; absente, la carte reste (réglages). */
  onDismiss?: () => void;
  /** Montrer aussi l'état « activé » (réglages). */
  showWhenOn?: boolean;
}

/**
 * Invitation à recevoir les notifications sur le téléphone, application
 * fermée. Elle s'adapte à l'appareil : bouton d'activation, explication
 * de l'installation sur iPhone, ou chemin pour réautoriser après un refus.
 */
export function PushCard({ message, onEnable, onDismiss, showWhenOn = false }: PushCardProps) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushStatus().then(setStatus);
  }, []);

  if (status === null || status === 'unsupported') return null;
  if (status === 'on' && !showWhenOn) return null;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await onEnable());
    } catch {
      setError('Activation impossible. Vérifiez votre connexion et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, status === 'on' && styles.cardOn]}>
      <View style={styles.head}>
        <View style={[styles.icon, status === 'on' && styles.iconOn]}>
          <Icon name={status === 'on' ? 'check' : 'bell'} size={18} color={status === 'on' ? colors.success : colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>
            {status === 'on' ? 'Notifications activées sur ce téléphone' : 'Recevoir les notifications sur ce téléphone'}
          </Text>
          <Text style={styles.body}>
            {status === 'on'
              ? 'Elles arrivent même application fermée, comme un message.'
              : status === 'needs-install'
                ? 'Sur iPhone, installez d’abord l’application : touchez Partager, puis « Sur l’écran d’accueil ». Ouvrez-la depuis son icône et revenez ici.'
                : status === 'denied'
                  ? 'Les notifications sont bloquées. Autorisez-les dans les réglages du téléphone (ou du navigateur) pour ce site, puis revenez ici.'
                  : message}
          </Text>
        </View>
        {onDismiss && status !== 'on' && (
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Plus tard">
            <Icon name="close" size={16} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>
      {status === 'off' && <Button label="Activer les notifications" onPress={() => void enable()} loading={busy} />}
      {Boolean(error) && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  cardOn: {
    backgroundColor: colors.successSoft,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: {
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  body: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  error: {
    ...typography.small,
    color: colors.danger,
  },
});
