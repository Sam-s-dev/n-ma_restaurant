import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

interface WorkspaceHeaderProps {
  restaurantName: string;
  greeting: string;
  /**
   * Solde de caisse, affiché en permanence comme le demande le §7 — sauf
   * pour les rôles qui n'ont pas à le connaître.
   */
  balance?: string;
  /** Logo du restaurant, quand il en a chargé un (§3). */
  logoUri?: string | null;
  onPressAccount: () => void;
  onLogout: () => void;
}

/**
 * En-tête de l'espace restaurant.
 *
 * Pas de logo N'ma ici : cet écran appartient au restaurant, c'est son
 * propre logo qui y figure. L'initiale sert d'avatar tant qu'aucun logo
 * n'a été chargé.
 */
export function WorkspaceHeader({
  restaurantName,
  greeting,
  balance,
  logoUri,
  onPressAccount,
  onLogout,
}: WorkspaceHeaderProps) {
  const initials = restaurantName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onPressAccount}
        style={styles.avatar}
        accessibilityRole="button"
        accessibilityLabel="Paramètres du restaurant"
      >
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        )}
      </Pressable>

      <View style={styles.headerTexts}>
        <Text style={styles.greeting} numberOfLines={1}>
          {greeting}
        </Text>
        <Text style={styles.restaurant} numberOfLines={1}>
          {restaurantName}
        </Text>
      </View>

      {balance !== undefined && (
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>En caisse</Text>
          <Text style={styles.balanceValue} numberOfLines={1}>
            {balance}
          </Text>
        </View>
      )}

      {/* Déconnexion à portée de pouce : plusieurs personnes se relaient
          sur le même téléphone en salle. */}
      <Pressable
        onPress={onLogout}
        style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Se déconnecter"
        hitSlop={8}
      >
        <Icon name="logout" size={17} color={colors.danger} strokeWidth={2.1} />
      </Pressable>
    </View>
  );
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}

/** En-tête d'un module : titre, sous-titre, retour éventuel. */
export function ScreenHeader({ title, subtitle, onBack, action }: ScreenHeaderProps) {
  return (
    <View style={styles.screenHeader}>
      {Boolean(onBack) && (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Icon name="chevron-left" size={20} color={colors.textPrimary} strokeWidth={2.4} />
        </Pressable>
      )}

      <View style={styles.screenTexts}>
        <Text style={[typography.h1, styles.screenTitle]} numberOfLines={1}>
          {title}
        </Text>
        {Boolean(subtitle) && (
          <Text style={styles.screenSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {action}
    </View>
  );
}

interface RoundButtonProps {
  icon: React.ComponentProps<typeof Icon>['name'];
  onPress: () => void;
  label: string;
  tone?: 'default' | 'primary';
}

/** Bouton rond d'en-tête (ajouter, rafraîchir). */
export function RoundButton({ icon, onPress, label, tone = 'default' }: RoundButtonProps) {
  const primary = tone === 'primary';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.round,
        primary && styles.roundPrimary,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={icon}
        size={19}
        color={primary ? colors.textOnPrimary : colors.textPrimary}
        strokeWidth={2.2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  logout: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textOnPrimary,
  },
  headerTexts: {
    flex: 1,
  },
  greeting: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  restaurant: {
    ...typography.h3,
    fontSize: 16,
    lineHeight: 22,
  },
  balance: {
    alignItems: 'flex-end',
    backgroundColor: colors.pastelGreen,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: 130,
  },
  balanceLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.iconGreen,
  },
  balanceValue: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.success,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTexts: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 23,
    lineHeight: 30,
  },
  screenSubtitle: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
