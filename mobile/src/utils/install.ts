import { Platform } from 'react-native';

/**
 * Installation de la version web comme une application (PWA).
 *
 * Android et les navigateurs d'ordinateur (Chrome, Edge) proposent une
 * vraie boîte « Installer » : l'événement `beforeinstallprompt` la tient en
 * réserve, et on la déclenche au toucher du bouton. Il n'arrive qu'une fois,
 * au chargement de la page, d'où l'écoute posée dès le démarrage.
 *
 * L'iPhone n'a pas cette boîte : on y explique le geste Partager → « Sur
 * l'écran d'accueil ».
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | 'installed' | 'unavailable';

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

export function isStandalone(): boolean {
  if (!isWeb) return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (!isWeb) return false;
  const ua = navigator.userAgent;
  // Les iPad récents se présentent comme un Mac : on les reconnaît au tactile.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** À appeler une fois au démarrage : service worker et écoute de l'installation. */
export function setUpInstallation(): void {
  if (!isWeb) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });

  // En développement, le cache gênerait le rechargement à chaud.
  if (!__DEV__ && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

export function installMode(): InstallMode {
  if (!isWeb) return 'unavailable';
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'unavailable';
}

/** Ouvre la boîte d'installation du navigateur ; vrai si la personne accepte. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  emit();
  return choice.outcome === 'accepted';
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
