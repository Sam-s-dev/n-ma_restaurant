import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { LottieIcon } from '../components/LottieIcon';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, screenPadding, spacing } from '../theme/layout';

interface RegisterSuccessScreenProps {
  /** Message renvoyé par le backend, réutilisé tel quel. */
  message: string;
  onGoToLogin: () => void;
  onGoHome: () => void;
}

/**
 * Écran de confirmation après inscription (§2.b).
 * Le compte existe en base avec le statut « en attente d'activation » :
 * l'écran doit le dire sans ambiguïté pour que le gérant ne cherche pas
 * à se connecter en boucle.
 */
export function RegisterSuccessScreen({
  message,
  onGoToLogin,
  onGoHome,
}: RegisterSuccessScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.frame,
          { paddingTop: insets.top + spacing.huge, paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <View style={styles.body}>
          <LottieIcon
            name="validation"
            background={colors.pastelGreen}
            size={104}
            speed={0.8}
            style={styles.icon}
          />

          <Text style={[typography.h1, styles.title]}>Demande envoyée</Text>
          <Text style={[typography.body, styles.message]}>{message}</Text>

          <View style={styles.notice}>
            <View style={styles.noticeHeader}>
              <View style={styles.noticeDot} />
              <Text style={styles.noticeTitle}>En attente d’activation</Text>
            </View>
            <Text style={[typography.small, styles.noticeBody]}>
              Vous ne pourrez pas encore vous connecter. Dès que notre équipe aura
              validé votre restaurant, votre accès s’ouvrira automatiquement avec
              l’e-mail et le mot de passe que vous venez de choisir.
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button label="Aller à la connexion" onPress={onGoToLogin} variant="primary" />
          <Button label="Revenir à l’accueil" onPress={onGoHome} variant="ghost" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  frame: {
    flex: 1,
    paddingHorizontal: screenPadding,
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginBottom: spacing.xxl,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginTop: spacing.md,
  },
  notice: {
    marginTop: spacing.xxxl,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(224, 138, 30, 0.24)',
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  noticeTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    color: colors.warning,
  },
  noticeBody: {
    color: colors.textPrimary,
  },
  actions: {
    gap: spacing.sm,
  },
});
