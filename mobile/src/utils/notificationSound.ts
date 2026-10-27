import { Platform, Vibration } from 'react-native';

/**
 * Signal sonore d'une notification, à la manière d'une messagerie.
 *
 * Sur navigateur, le son est synthétisé : deux notes courtes, sans fichier
 * à télécharger. Les navigateurs interdisent tout son avant un premier geste
 * de la personne sur la page ; `unlockNotificationSound` prépare donc le
 * contexte audio au premier toucher, et le son pourra jouer ensuite même
 * sans interaction. Sur téléphone (application installée), on vibre.
 */

type AudioContextConstructor = new () => AudioContext;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor =
    (window as unknown as { AudioContext?: AudioContextConstructor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** À brancher une fois : le premier toucher autorise les sons suivants. */
export function unlockNotificationSound(): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return () => undefined;

  const unlock = () => {
    const ctx = audioContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  };
  document.addEventListener('pointerdown', unlock, { once: false, passive: true });
  document.addEventListener('keydown', unlock, { passive: true });
  return () => {
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
}

export function playNotificationSound(): void {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 120, 80, 120]);
    return;
  }

  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;

  // Deux notes montantes (mi puis la), brèves et douces.
  const notes = [659.25, 880];
  notes.forEach((frequency, index) => {
    const start = ctx.currentTime + index * 0.14;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}
