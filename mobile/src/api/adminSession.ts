import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AdminLoginResponse, AdminProfile } from './superadmin';

/**
 * Session de l'éditeur, stockée sous des clés distinctes de celles des
 * gérants (`nma.*`). Les deux espaces peuvent ainsi rester ouverts en
 * parallèle sans que l'un écrase le jeton de l'autre.
 */
const KEYS = {
  accessToken: 'nma.admin.accessToken',
  refreshToken: 'nma.admin.refreshToken',
  profile: 'nma.admin.profile',
} as const;

export interface StoredAdminSession {
  accessToken: string;
  refreshToken: string;
  admin: AdminProfile;
}

export async function saveAdminSession(session: AdminLoginResponse): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.accessToken, session.accessToken],
    [KEYS.refreshToken, session.refreshToken],
    [KEYS.profile, JSON.stringify(session.admin)],
  ]);
}

export async function loadAdminSession(): Promise<StoredAdminSession | null> {
  const entries = await AsyncStorage.multiGet([KEYS.accessToken, KEYS.refreshToken, KEYS.profile]);
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  const accessToken = map[KEYS.accessToken];
  const refreshToken = map[KEYS.refreshToken];
  const rawProfile = map[KEYS.profile];
  if (!accessToken || !refreshToken || !rawProfile) return null;

  try {
    return { accessToken, refreshToken, admin: JSON.parse(rawProfile) as AdminProfile };
  } catch {
    await clearAdminSession();
    return null;
  }
}

export async function clearAdminSession(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.accessToken, KEYS.refreshToken, KEYS.profile]);
}
