import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { LoginResponse, Profile } from './auth';

/**
 * Connexion sans internet.
 *
 * À chaque connexion réussie en ligne, le téléphone garde le profil et une
 * empreinte du mot de passe — jamais le mot de passe lui-même. Pendant une
 * coupure, celui qui s'est déjà connecté sur ce téléphone peut rouvrir sa
 * session : l'empreinte de ce qu'il tape est comparée à celle gardée.
 *
 * Le mot de passe saisi reste en mémoire, le temps de la coupure : au
 * retour du réseau, la vraie connexion se fait d'elle-même, et les ventes
 * partent.
 */

interface StoredAccount {
  salt: string;
  hash: string;
  profile: Profile;
  savedAt: number;
}

const ACCOUNTS_KEY = 'nma.offline.accounts';
/** Au-delà, il faut s'être reconnecté en ligne : un compte retiré ne vit pas éternellement. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ROUNDS = 2000;

async function readAccounts(): Promise<Record<string, StoredAccount>> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, StoredAccount>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Empreinte lente à calculer : deviner un mot de passe par essais coûte cher. */
async function fingerprint(salt: string, email: string, password: string): Promise<string> {
  let value = `${salt}:${email}:${password}`;
  for (let round = 0; round < ROUNDS; round += 1) {
    value = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}${value}`);
  }
  return value;
}

/** Après une connexion en ligne réussie. */
export async function rememberAccount(email: string, password: string, session: LoginResponse): Promise<void> {
  try {
    const salt = Crypto.randomUUID();
    const accounts = await readAccounts();
    accounts[email] = {
      salt,
      hash: await fingerprint(salt, email, password),
      profile: session.profile,
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Sans cette copie, la connexion hors ligne ne sera simplement pas proposée.
  }
}

/** Le profil connu, si l'e-mail et le mot de passe correspondent à ceux gardés. */
export async function loginOffline(email: string, password: string): Promise<Profile | null> {
  const account = (await readAccounts())[email];
  if (!account || Date.now() - account.savedAt > MAX_AGE_MS) return null;
  const hash = await fingerprint(account.salt, email, password);
  return hash === account.hash ? account.profile : null;
}

/** Un mot de passe refusé par le serveur : la copie ne doit plus ouvrir de session. */
export async function forgetAccount(email: string): Promise<void> {
  const accounts = await readAccounts();
  if (!(email in accounts)) return;
  delete accounts[email];
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)).catch(() => undefined);
}

// --- Session ouverte hors ligne, en attente de la vraie connexion ------------

let pending: { email: string; password: string } | null = null;

export function setPendingLogin(credentials: { email: string; password: string } | null): void {
  pending = credentials;
}

export function pendingLogin(): { email: string; password: string } | null {
  return pending;
}
