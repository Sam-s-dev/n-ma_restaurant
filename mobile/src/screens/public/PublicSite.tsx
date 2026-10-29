import { useEffect, useState } from 'react';
import { pathOf } from '../../utils/publicRoute';
import type { PublicRoute } from '../../utils/publicRoute';
import { OrderTrackingScreen } from './OrderTrackingScreen';
import { PublicMenuScreen } from './PublicMenuScreen';

/**
 * Mini-site d'un restaurant, hors de l'application du personnel : pas de
 * connexion, pas de navigation interne, deux pages seulement. L'adresse
 * du navigateur suit la page affichée, pour que le lien de suivi se
 * partage et se recharge.
 */
export function PublicSite({ initial }: { initial: PublicRoute }) {
  const [route, setRoute] = useState<PublicRoute>(initial);

  useEffect(() => {
    const onPop = () => {
      const state = window.history.state as PublicRoute | null;
      if (state?.kind) setRoute(state);
    };
    window.history.replaceState(initial, '', pathOf(initial));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [initial]);

  function go(next: PublicRoute) {
    window.history.pushState(next, '', pathOf(next));
    setRoute(next);
  }

  return route.kind === 'menu' ? (
    <PublicMenuScreen
      key={route.slug}
      slug={route.slug}
      onOrdered={(code) => go({ kind: 'track', code })}
      onTrack={(code) => go({ kind: 'track', code })}
    />
  ) : (
    <OrderTrackingScreen key={route.code} code={route.code} onBackToMenu={(slug) => go({ kind: 'menu', slug })} />
  );
}
