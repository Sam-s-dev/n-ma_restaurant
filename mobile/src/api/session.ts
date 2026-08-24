import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LoginResponse, Profile } from './auth';

/**
 * Conservation de la session entre deux lancements de l'application.
 *
 * AsyncStorage n'est pas chiffré : il convient pour cette étape d'onboarding.
 * Avant la mise en production, basculer les jetons vers `expo-secure-store`
 * (Keychain iOS / Keystore Android).
 */
const KEYS = {
  accessToken: 'nma.accessToken',
  refreshToken: 'nma.refreshToken',
  profile: 'nma.profile',
} as const;

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  profile: Profile;
}

export async function saveSession(session: LoginResponse): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.accessToken, session.accessToken],
    [KEYS.refreshToken, session.refreshToken],
    [KEYS.profile, JSON.stringify(session.profile)],
  ]);
}

/**
 * Enregistre le couple de jetons renouvelé. Le backend fait tourner le
 * refresh token à chaque usage : sans cette écriture, le jeton conservé
 * sur l'appareil serait révoqué et la session sauterait au redémarrage.
 */
export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.accessToken, accessToken],
    [KEYS.refreshToken, refreshToken],
  ]);
}

/** Met à jour le profil mémorisé (changement de nom, de logo, de devise). */
export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(KEYS.profile, JSON.stringify(profile));
}

export async function loadSession(): Promise<StoredSession | null> {
  const entries = await AsyncStorage.multiGet([
    KEYS.accessToken,
    KEYS.refreshToken,
    KEYS.profile,
  ]);
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  const accessToken = map[KEYS.accessToken];
  const refreshToken = map[KEYS.refreshToken];
  const rawProfile = map[KEYS.profile];
  if (!accessToken || !refreshToken || !rawProfile) return null;

  try {
    return { accessToken, refreshToken, profile: JSON.parse(rawProfile) as Profile };
  } catch {
    // Données corrompues : on repart d'une session vide plutôt que de planter.
    await clearSession();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.accessToken, KEYS.refreshToken, KEYS.profile]);
}
