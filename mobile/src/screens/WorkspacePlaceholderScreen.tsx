import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { Profile } from '../api/auth';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, screenPadding, spacing } from '../theme/layout';

interface WorkspacePlaceholderScreenProps {
  profile: Profile;
  onLogout: () => void;
}

/**
 * Point d'arrivée après connexion.
 *
 * L'espace de gestion (caisse, ventes, stock, personnel) reste à construire :
 * cet écran confirme que l'authentification et l'isolation par restaurant
 * fonctionnent, et sert de socle aux prochains écrans. Le logo N'ma n'y
 * figure pas — c'est le logo du restaurant qui a sa place ici.
 */
export function WorkspacePlaceholderScreen({
  profile,
  onLogout,
}: WorkspacePlaceholderScreenProps) {
  const insets = useSafeAreaInsets();
  const { restaurant, user } = profile;

  const initials = restaurant.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.frame,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
      <View style={styles.body}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <Text style={[typography.caption, styles.eyebrow]}>Espace restaurant</Text>
        <Text style={[typography.h1, styles.name]}>{restaurant.name}</Text>
        <Text style={[typography.body, styles.welcome]}>
          Bienvenue {user.fullName.split(' ')[0]} — votre compte est actif.
        </Text>

        <Card style={styles.card}>
          <Row label="Devise" value={`${restaurant.currencyCode} · ${restaurant.currencySymbol}`} />
          <View style={styles.divider} />
          <Row label="Statut du compte" value="Actif" tone={colors.success} />
          <View style={styles.divider} />
          <Row label="Connecté en tant que" value={user.email} />
        </Card>

        <Text style={[typography.small, styles.note]}>
          Les modules caisse, ventes, stock, menu et personnel arrivent à la
          prochaine étape.
        </Text>
      </View>

        <Button label="Se déconnecter" onPress={onLogout} variant="secondary" />
      </View>
    </View>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Text style={typography.small}>{label}</Text>
      <Text style={[typography.bodyStrong, styles.rowValue, tone ? { color: tone } : null]}>
        {value}
      </Text>
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
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  avatarText: {
    ...typography.h1,
    color: '#FFFFFF',
  },
  eyebrow: {
    marginBottom: spacing.xs,
  },
  name: {
    textAlign: 'center',
  },
  welcome: {
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  card: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  note: {
    textAlign: 'center',
    marginTop: spacing.xl,
    color: colors.textTertiary,
  },
});
