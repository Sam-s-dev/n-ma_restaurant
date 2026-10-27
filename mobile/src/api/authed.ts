import { API_URL, ApiError, request } from './client';
import { saveTokens } from './session';

/**
 * Appels authentifiés de l'espace restaurant.
 *
 * Le jeton d'accès expire au bout de deux heures. Plutôt que de déconnecter
 * le gérant en plein service, on renouvelle silencieusement la session au
 * premier 401 puis on rejoue la requête. Le renouvellement est mis en file
 * unique : dix écrans qui rechargent en même temps ne consomment qu'un
 * seul refresh token — le backend les invalide à l'usage, deux appels
 * concurrents feraient sauter la session.
 */
interface Tokens {
  accessToken: string;
  refreshToken: string;
}

let tokens: Tokens | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshing: Promise<Tokens> | null = null;

export function setAuthTokens(next: Tokens | null): void {
  tokens = next;
}

export function getAccessToken(): string | null {
  return tokens?.accessToken ?? null;
}

/** Prévient la navigation quand la session est définitivement perdue. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

interface AuthedOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
}

export async function authed<T>(path: string, options: AuthedOptions = {}): Promise<T> {
  if (!tokens) {
    const error = new ApiError(401, 'UNAUTHORIZED', 'Session expirée, reconnectez-vous.');
    onSessionExpired?.();
    throw error;
  }

  try {
    return await request<T>(path, { ...options, token: tokens.accessToken });
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'UNAUTHORIZED') throw error;

    let renewed: Tokens;
    try {
      renewed = await renew();
    } catch {
      onSessionExpired?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée, reconnectez-vous.');
    }

    return request<T>(path, { ...options, token: renewed.accessToken });
  }
}

/**
 * Téléchargement d'un fichier (export Excel) avec la session courante.
 * Même renouvellement du jeton qu'`authed`, mais la réponse est un binaire,
 * pas du JSON.
 */
export async function authedBlob(path: string): Promise<Blob> {
  if (!tokens) throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée, reconnectez-vous.');

  const fetchWith = (accessToken: string) =>
    fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });

  let response = await fetchWith(tokens.accessToken);
  if (response.status === 401) response = await fetchWith((await renew()).accessToken);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(
      response.status,
      'INTERNAL',
      body?.error?.message ?? 'Téléchargement impossible. Réessayez.',
    );
  }
  return response.blob();
}

/**
 * Renouvellement exposé pour l'envoi d'images, qui n'utilise pas `authed`
 * (multipart, et non JSON) mais doit profiter de la même file unique.
 */
export function renewTokens(): Promise<Tokens> {
  return renew();
}

async function renew(): Promise<Tokens> {
  if (refreshing) return refreshing;

  const current = tokens;
  if (!current) throw new Error('Aucune session à renouveler.');

  refreshing = request<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken: current.refreshToken },
  })
    .then(async (result) => {
      const next = { accessToken: result.accessToken, refreshToken: result.refreshToken };
      tokens = next;
      await saveTokens(next.accessToken, next.refreshToken).catch(() => undefined);
      return next;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

/**
 * Construit une chaîne de requête en ignorant les filtres non renseignés,
 * pour ne pas envoyer `?search=undefined` au backend.
 */
export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}
