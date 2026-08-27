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

/**
 * Largeurs de vignettes servies par l'API. Toute autre valeur renverrait
 * l'original — inutilement lourd.
 */
export const THUMB = {
  /** Pastille de liste, avatar. */
  small: 96,
  /** Vignette d'un plat dans la grille de vente. */
  medium: 320,
  /** Affichage sur toute la largeur de l'écran. */
  large: 720,
} as const;

/**
 * Adresse absolue d'une image stockée en base. Les réponses de l'API ne
 * contiennent qu'un chemin relatif, inutilisable tel quel dans `<Image>`.
 *
 * `width` demande une version réduite. Sans elle, on reçoit la photo telle
 * que l'appareil l'a prise : mesuré sur un restaurant réel, neuf plats
 * pesaient 4 Mo pour un seul écran, soit une demi-minute d'attente sur un
 * réseau mobile. Les mêmes vignettes en 320 points tiennent en quelques
 * dizaines de kilo-octets.
 */
export function mediaUrl(
  mediaId: string | null | undefined,
  width?: number,
): string | null {
  if (!mediaId) return null;
  const base = `${API_URL}/api/media/${mediaId}`;
  return width ? `${base}?w=${width}` : base;
}

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

/**
 * Réveil du serveur.
 *
 * L'offre gratuite de Render endort l'instance après un quart d'heure sans
 * trafic. La première requête doit alors attendre le démarrage complet du
 * conteneur : mesuré à 25 secondes sur le compte de production. L'ancien
 * délai de 20 secondes coupait donc la connexion juste avant la réponse, et
 * le gérant voyait « le serveur met trop de temps » alors qu'il était sur le
 * point d'aboutir.
 *
 * Une fois l'instance réveillée, les appels reviennent en 150 à 500 ms.
 */
const WAKE_UP_TIMEOUT_MS = 60_000;

/**
 * Sollicite le serveur sans attendre la réponse.
 *
 * Appelé au lancement de l'application : pendant que l'utilisateur lit la
 * page d'accueil et saisit ses identifiants, l'instance a le temps de se
 * réveiller. La connexion qui suit répond alors immédiatement.
 */
export function warmUpServer(): void {
  fetch(`${API_URL}/health`).catch(() => undefined);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  /** Coupe la requête si le serveur ne répond pas du tout. */
  timeoutMs?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, timeoutMs = WAKE_UP_TIMEOUT_MS } = options;

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
        ? 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.'
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
