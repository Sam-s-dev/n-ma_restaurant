import { Platform } from 'react-native';
import { authed } from '../api/authed';
import { request } from '../api/client';
import { isIos, isStandalone } from './install';

/**
 * Notifications sur le téléphone, application fermée (Web Push).
 *
 * L'appareil s'abonne une fois, avec l'accord de la personne ; le serveur
 * lui envoie ensuite chaque notification, affichée sur l'écran verrouillé
 * comme un message. Sur iPhone, Apple ne l'autorise qu'à l'application
 * installée sur l'écran d'accueil.
 */
export type PushStatus =
  /** Navigateur trop ancien, ou application installée depuis un store. */
  | 'unsupported'
  /** iPhone : installer d'abord l'application sur l'écran d'accueil. */
  | 'needs-install'
  /** Refusé dans les réglages du téléphone : seul l'utilisateur peut revenir dessus. */
  | 'denied'
  | 'off'
  | 'on';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

function supported(): boolean {
  return isWeb && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js');
}

export async function pushStatus(): Promise<PushStatus> {
  if (isWeb && isIos() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration().catch(() => null);
  const subscription = await reg?.pushManager.getSubscription().catch(() => null);
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

/** La clé publique du serveur, au format attendu par le navigateur. */
function decodeKey(base64: string): Uint8Array {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg) return null;
  // À demander au toucher d'un bouton : les navigateurs refusent sinon.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const { publicKey } = await request<{ publicKey: string }>('/api/push/key');
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeKey(publicKey) as BufferSource,
  });
}

/** Le personnel : les notifications de son compte arrivent sur cet appareil. */
export async function enablePush(): Promise<PushStatus> {
  const sub = await subscription();
  if (!sub) return pushStatus();
  await authed('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return 'on';
}

/** Le client du mini-site : l'avancée de sa commande arrive sur son téléphone. */
export async function enableOrderPush(trackingCode: string): Promise<PushStatus> {
  const sub = await subscription();
  if (!sub) return pushStatus();
  await request(`/api/public/orders/${encodeURIComponent(trackingCode)}/push`, {
    method: 'POST',
    body: sub.toJSON(),
  });
  return 'on';
}

/** À la déconnexion : l'appareil cesse de recevoir les messages du compte. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await request('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(
      () => undefined,
    );
    await sub.unsubscribe();
  } catch {
    // Hors ligne : l'abonnement sera nettoyé au premier envoi refusé.
  }
}

/**
 * Le message touché alors que l'application était ouverte : le service
 * worker demande de changer d'écran plutôt que de recharger la page.
 */
export function onPushNavigate(handler: (url: string) => void): () => void {
  if (!supported()) return () => undefined;
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type === 'nma:navigate' && data.url) handler(data.url);
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}
