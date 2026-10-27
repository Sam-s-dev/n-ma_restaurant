import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { installMode, promptInstall, subscribeInstall } from '../utils/install';
import type { InstallMode } from '../utils/install';
import { colors } from '../theme/colors';
import { fontFamily, typography } from '../theme/typography';
import { radius, spacing } from '../theme/layout';

/**
 * Invitation à installer l'application sur l'appareil.
 *
 * N'apparaît que là où l'installation est possible et pas encore faite :
 * rien dans l'application déjà installée, rien sur un navigateur qui ne
 * sait pas installer.
 */
export function InstallAppCard() {
  const [mode, setMode] = useState<InstallMode>(installMode);

  useEffect(() => subscribeInstall(() => setMode(installMode())), []);

  if (mode === 'installed' || mode === 'unavailable') return null;

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Icon name="arrow-down" size={18} color={colors.primary} strokeWidth={2.4} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>Installez N’ma sur cet appareil</Text>
        <Text style={styles.body}>
          {mode === 'ios'
            ? 'Touchez le bouton Partager de Safari, puis « Sur l’écran d’accueil ». L’application s’ouvrira en plein écran, comme les autres.'
            : 'Une icône sur votre écran d’accueil, l’application en plein écran, et une ouverture plus rapide.'}
        </Text>
        {mode === 'prompt' && (
          <View style={styles.action}>
            <Button label="Installer l’application" onPress={() => void promptInstall()} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
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
    color: colors.textSecondary,
    marginTop: 2,
  },
  action: {
    marginTop: spacing.md,
  },
});
