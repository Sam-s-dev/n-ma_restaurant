import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';

/**
 * Cache mémoire des réponses de l'API, avec revalidation en arrière-plan.
 *
 * Les onglets de l'espace sont démontés au changement d'écran : sans cache,
 * revenir sur l'accueil relançait tout le chargement et affichait un rond
 * qui tourne, alors que les chiffres d'il y a dix secondes conviennent
 * parfaitement. Ici la valeur connue s'affiche immédiatement et la requête
 * part quand même, silencieusement, pour la mettre à jour.
 *
 * Le cache vit le temps de la session. Il est vidé à la déconnexion : les
 * données d'un restaurant ne doivent jamais réapparaître sous le compte
 * d'un autre.
 */
interface Entry {
  value: unknown;
  at: number;
}

const store = new Map<string, Entry>();

/** Au-delà, la valeur est considérée comme trop vieille pour être montrée. */
const MAX_AGE_MS = 5 * 60_000;

export function readCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > MAX_AGE_MS) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeCache(key: string, value: unknown): void {
  store.set(key, { value, at: Date.now() });
}

/**
 * Invalide les entrées dont la clé commence par l'un des préfixes.
 * Appelé après une écriture : une vente périme le tableau de bord, la
 * caisse et le menu (les portions ont bougé).
 */
export function invalidateCache(...prefixes: string[]): void {
  if (prefixes.length === 0) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) store.delete(key);
  }
}

export interface Resource<T> {
  data: T | null;
  /** Vrai seulement au tout premier chargement, sans valeur en cache. */
  loading: boolean;
  error: string | null;
  /** Rechargement explicite, pour le tirer-pour-rafraîchir. */
  refresh: () => Promise<void>;
}

/**
 * Charge une ressource en affichant d'abord ce que l'on sait déjà.
 *
 * `key` identifie la ressource ; changer de clé (une période, un filtre)
 * relance le chargement et sert la valeur mise en cache pour cette clé.
 */
export function useResource<T>(key: string, fetcher: () => Promise<T>): Resource<T> {
  const cached = readCache<T>(key);
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  // La fonction de chargement change à chaque rendu chez l'appelant : on la
  // garde dans une référence pour que l'effet ne dépende que de la clé.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const value = await fetcherRef.current();
        writeCache(key, value);
        setData(value);
        setError(null);
      } catch (cause) {
        const message = cause instanceof ApiError ? cause.message : 'Chargement impossible.';
        // Une valeur déjà affichée vaut mieux qu'un écran d'erreur : on ne
        // signale la panne que si l'on n'a rien à montrer.
        if (readCache<T>(key) === null) setError(message);
      } finally {
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    const known = readCache<T>(key);
    setData(known);
    setError(null);
    void load(known !== null);
  }, [key, load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refresh };
}
