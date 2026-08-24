/** Backend de production, utilisé si aucune adresse n'est fournie au build. */
const DEFAULT_API_URL = 'https://n-ma-restaurant.onrender.com';

/**
 * Client HTTP de l'API N'ma Restaurant.
 *
 * L'adresse vient de EXPO_PUBLIC_API_URL, fixée au moment de la compilation
 * (fichier `mobile/.env` en local, variable d'environnement sur Render).
 * À défaut, on vise le backend en ligne : c'est le comportement attendu
 * pour une application distribuée, et cela évite qu'un build oublié pointe
 * sur `localhost` — introuvable depuis un téléphone.
 *
 * Pour développer contre un backend local, mettre dans `mobile/.env`
 * l'adresse IP du PC (jamais `localhost`) :
 *   EXPO_PUBLIC_API_URL=http://192.168.1.12:4000
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');

/** Code d'erreur renvoyé par le backend (voir backend/src/core/errors.ts). */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL'
  | 'NETWORK';

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: FieldError[];

  constructor(status: number, code: ApiErrorCode, message: string, fields: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** Erreur de validation portant sur un champ précis du formulaire. */
  fieldError(name: string): string | undefined {
    return this.fields.find((f) => f.field === name)?.message;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  /** Coupe la requête si le serveur ne répond pas (Render met les instances en veille). */
  timeoutMs?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, timeoutMs = 20_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    // Panne réseau, serveur éteint, ou mauvaise adresse : on le dit clairement
    // plutôt que de laisser fuiter « Network request failed ».
    const aborted = (error as Error)?.name === 'AbortError';
    throw new ApiError(
      0,
      'NETWORK',
      aborted
        ? 'Le serveur met trop de temps à répondre. Réessayez dans un instant.'
        : 'Impossible de joindre le serveur. Vérifiez votre connexion internet.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    const details = Array.isArray(errorBody?.details) ? (errorBody.details as FieldError[]) : [];

    throw new ApiError(
      response.status,
      (errorBody?.code as ApiErrorCode) ?? 'INTERNAL',
      errorBody?.message ?? 'Une erreur est survenue. Réessayez.',
      details,
    );
  }

  return payload as T;
}
