import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { login } from './auth';
import { authed, expireSession, setAuthTokens } from './authed';
import { forgetAccount, pendingLogin, setPendingLogin } from './offlineLogin';
import { saveSession } from './session';
import { invalidateCache } from './cache';
import { API_URL, ApiError } from './client';
import type { PaymentMethod } from './workspace/sales';

/**
 * Mode hors connexion.
 *
 * Quand internet coupe, chaque téléphone travaille seul : il vend avec la
 * dernière carte connue, imprime un ticket au numéro provisoire (HL-0001)
 * et garde la vente chez lui. Au retour du réseau, les ventes partent
 * seules, dans l'ordre, et reçoivent leur vrai numéro. Un identifiant créé
 * ici garantit qu'une vente renvoyée deux fois n'est comptée qu'une fois.
 */

export interface OfflineSale {
  clientId: string;
  offlineRef: string;
  soldAt: string;
  paymentMethod: PaymentMethod;
  items: Array<{ dishId: string; dishName: string; unitPrice: number; quantity: number }>;
  totalAmount: number;
  customerId?: string;
  customerName?: string;
  note?: string;
  /** Refusée par le serveur : elle reste ici, avec la raison, sans repartir. */
  rejected?: string;
}

interface State {
  online: boolean;
  syncing: boolean;
  pending: OfflineSale[];
}

let state: State = { online: true, syncing: false, pending: [] };
let owner: string | null = null;
const listeners = new Set<(next: State) => void>();

function emit(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

const queueKey = (userId: string) => `nma.offline.sales.${userId}`;
const COUNTER_KEY = 'nma.offline.counter';

async function persist() {
  if (owner) await AsyncStorage.setItem(queueKey(owner), JSON.stringify(state.pending)).catch(() => undefined);
}

/** Identifiant unique de la vente, créé sur le téléphone. */
export function newClientId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** « HL-0007 » : le numéro imprimé sur le ticket en attendant le vrai. */
async function nextOfflineRef(): Promise<string> {
  const current = Number((await AsyncStorage.getItem(COUNTER_KEY).catch(() => null)) ?? '0') || 0;
  const next = current + 1;
  await AsyncStorage.setItem(COUNTER_KEY, String(next)).catch(() => undefined);
  return `HL-${String(next).padStart(4, '0')}`;
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NETWORK';
}

/** Une requête a échoué faute de réseau : on bascule en hors connexion. */
export function markOffline(): void {
  if (state.online) emit({ online: false });
}

export function markOnline(): void {
  if (!state.online) {
    emit({ online: true });
    void reconnect();
  }
}

/**
 * Retour du réseau : la session ouverte hors ligne devient une vraie
 * connexion, puis les ventes en attente partent.
 */
let reconnecting = false;

async function reconnect(): Promise<void> {
  // Le guet régulier et l'événement « en ligne » peuvent arriver ensemble.
  if (reconnecting) return;
  reconnecting = true;
  try {
    await reconnectOnce();
  } finally {
    reconnecting = false;
  }
}

async function reconnectOnce(): Promise<void> {
  const credentials = pendingLogin();
  if (credentials) {
    try {
      const session = await login(credentials.email, credentials.password);
      setAuthTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
      await saveSession(session);
      setPendingLogin(null);
    } catch (error) {
      if (isNetworkError(error)) {
        emit({ online: false });
        return;
      }
      // Mot de passe changé, compte désactivé : la copie ne vaut plus rien.
      // Les ventes restent gardées sous ce compte jusqu'à sa prochaine connexion.
      await forgetAccount(credentials.email);
      setPendingLogin(null);
      expireSession();
      return;
    }
  }
  await syncPending();
}

/** Le serveur répond-il ? Un simple appel à sa page d'accueil suffit. */
async function probe(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${API_URL}/`, { signal: controller.signal });
    // Une session ouverte hors ligne attend sa vraie connexion, même si
    // l'application ne s'était pas encore crue coupée.
    if (state.online && pendingLogin()) void reconnect();
    else markOnline();
  } catch {
    markOffline();
  } finally {
    clearTimeout(timer);
  }
}

/** Garde la vente sur le téléphone et renvoie son numéro provisoire. */
export async function queueSale(sale: Omit<OfflineSale, 'offlineRef'>): Promise<OfflineSale> {
  const queued: OfflineSale = { ...sale, offlineRef: await nextOfflineRef() };
  emit({ pending: [...state.pending, queued], online: false });
  await persist();
  return queued;
}

/** Retirer une vente refusée, après l'avoir notée ailleurs. */
export async function discardSale(clientId: string): Promise<void> {
  emit({ pending: state.pending.filter((sale) => sale.clientId !== clientId) });
  await persist();
}

type SyncResult =
  | { clientId: string; status: 'created' | 'duplicate'; saleId: string; reference: string }
  | { clientId: string; status: 'rejected'; error: string; retry: boolean };

/** Envoie les ventes en attente. Sans effet hors ligne ou s'il n'y a rien. */
export async function syncPending(): Promise<void> {
  const toSend = state.pending.filter((sale) => !sale.rejected);
  if (state.syncing || toSend.length === 0 || !owner) return;
  emit({ syncing: true });
  try {
    const { results } = await authed<{ results: SyncResult[] }>('/api/sales/sync', {
      method: 'POST',
      body: {
        sales: toSend.slice(0, 100).map((sale) => ({
          clientId: sale.clientId,
          offlineRef: sale.offlineRef,
          soldAt: sale.soldAt,
          paymentMethod: sale.paymentMethod,
          items: sale.items.map((item) => ({ dishId: item.dishId, quantity: item.quantity })),
          ...(sale.customerId ? { customerId: sale.customerId } : {}),
          ...(sale.note ? { note: sale.note } : {}),
        })),
      },
    });
    const byId = new Map(results.map((result) => [result.clientId, result]));
    const remaining: OfflineSale[] = [];
    for (const sale of state.pending) {
      const result = byId.get(sale.clientId);
      if (!result) remaining.push(sale);
      else if (result.status === 'rejected') {
        remaining.push(result.retry ? sale : { ...sale, rejected: result.error });
      }
      // Arrivée (ou déjà arrivée) : elle quitte le téléphone.
    }
    emit({ pending: remaining, online: true });
    await persist();
    invalidateCache();
    // Plus de 100 ventes : le reste part dans la foulée.
    if (toSend.length > 100) setTimeout(() => void syncPending(), 1000);
  } catch (error) {
    if (isNetworkError(error)) emit({ online: false });
  } finally {
    emit({ syncing: false });
  }
}

/**
 * À l'ouverture de l'espace : relit les ventes en attente de ce compte et
 * surveille le retour du réseau.
 */
export function startOffline(userId: string): () => void {
  owner = userId;
  void AsyncStorage.getItem(queueKey(userId))
    .then((raw) => {
      const pending = raw ? (JSON.parse(raw) as OfflineSale[]) : [];
      emit({ pending: Array.isArray(pending) ? pending : [] });
      void (pendingLogin() ? probe() : syncPending());
    })
    .catch(() => undefined);

  const cleanups: Array<() => void> = [];
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const goOnline = () => markOnline();
    const goOffline = () => markOffline();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine === false) markOffline();
    cleanups.push(() => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    });
  }
  // Filet de sécurité : un réseau revenu sans prévenir est essayé régulièrement.
  const timer = setInterval(() => {
    // Hors ligne (ou session ouverte sans internet), on guette le retour du
    // serveur ; en ligne, on envoie ce qui reste.
    if (!state.online || pendingLogin()) void probe();
    else if (state.pending.some((sale) => !sale.rejected)) void syncPending();
  }, 15_000);
  cleanups.push(() => clearInterval(timer));

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    owner = null;
    emit({ pending: [], online: true, syncing: false });
  };
}

export function pendingCount(): number {
  return state.pending.length;
}

export function useOffline(): State {
  const [current, setCurrent] = useState(state);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(state);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}

// ---------------------------------------------------------------------------
// Dernières données connues : carte, clients, tables
// ---------------------------------------------------------------------------

let scope: string | null = null;
const snapshotKey = (key: string) => `nma.snap.${scope}.${key}`;

/** Les copies sont propres au restaurant : jamais celles d'un autre compte. */
export function setSnapshotScope(restaurantId: string | null): void {
  scope = restaurantId;
}

/**
 * Lit sur le serveur et garde une copie ; sans réseau, rend la dernière
 * copie connue. L'écran de vente reste ainsi utilisable pendant la coupure.
 */
export async function withSnapshot<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const value = await fetcher();
    markOnline();
    if (scope) void AsyncStorage.setItem(snapshotKey(key), JSON.stringify(value)).catch(() => undefined);
    return value;
  } catch (error) {
    if (!isNetworkError(error) || !scope) throw error;
    markOffline();
    const raw = await AsyncStorage.getItem(snapshotKey(key)).catch(() => null);
    if (raw === null) throw error;
    return JSON.parse(raw) as T;
  }
}

/** À la déconnexion : plus rien d'un restaurant ne reste sur l'appareil. */
export async function clearSnapshots(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  const ours = keys.filter((key) => key.startsWith('nma.snap.'));
  if (ours.length > 0) await AsyncStorage.multiRemove(ours).catch(() => undefined);
}
