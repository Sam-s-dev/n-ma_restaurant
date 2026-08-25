import { Platform } from 'react-native';
import { API_URL, ApiError } from './client';
import { getAccessToken, renewTokens } from './authed';

/**
 * Envoi d'images (photos de plats, logo du restaurant).
 *
 * Passe par `fetch` directement plutôt que par le client JSON : un envoi
 * multipart exige que le navigateur ou React Native fixe lui-même l'en-tête
 * `Content-Type` avec sa frontière. La renseigner à la main casse l'envoi.
 */
export interface UploadedMedia {
  id: string;
  mimeType: string;
  byteSize: number;
  url: string;
}

/** Le backend refuse au-delà (MAX_UPLOAD_BYTES). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function uploadImage(
  uri: string,
  options: { mimeType?: string | undefined; fileName?: string | null | undefined } = {},
): Promise<UploadedMedia> {
  const form = await buildForm(uri, options);

  const token = getAccessToken();
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée, reconnectez-vous.');

  let result = await send(form, token);

  // Même politique que les appels JSON : un jeton périmé se renouvelle une
  // fois, en silence, plutôt que d'interrompre le gérant en plein travail.
  if (result.status === 401) {
    const renewed = await renewTokens();
    result = await send(form, renewed.accessToken);
  }

  if (!result.ok) throw toApiError(result);
  return result.payload as UploadedMedia;
}

interface SendResult {
  ok: boolean;
  status: number;
  payload: unknown;
}

async function send(form: FormData, token: string): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/media`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'Envoi de l’image impossible. Vérifiez votre connexion internet.',
    );
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  return { ok: response.ok, status: response.status, payload };
}

function toApiError(result: SendResult): ApiError {
  const body = (result.payload as { error?: { code?: string; message?: string } })?.error;

  // Multer coupe au-delà de la limite : le message brut ne dit rien au gérant.
  if (result.status === 413 || (result.status === 500 && !body)) {
    return new ApiError(
      result.status,
      'BAD_REQUEST',
      'Image trop lourde. Reprenez la photo ou choisissez-en une plus légère.',
    );
  }

  return new ApiError(
    result.status,
    (body?.code as ApiError['code']) ?? 'INTERNAL',
    body?.message ?? 'Envoi de l’image impossible.',
  );
}

/**
 * Sur le web, l'URI rendue par le sélecteur est une `blob:` ou une `data:` :
 * il faut la relire pour obtenir un vrai fichier. Sur téléphone, React
 * Native accepte directement le triplet { uri, name, type }.
 */
async function buildForm(
  uri: string,
  options: { mimeType?: string | undefined; fileName?: string | null | undefined },
): Promise<FormData> {
  const form = new FormData();
  const mimeType = options.mimeType ?? 'image/jpeg';
  const name = options.fileName ?? `photo.${extensionFor(mimeType)}`;

  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((response) => response.blob());
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new ApiError(
        400,
        'BAD_REQUEST',
        'Image trop lourde (3 Mo maximum). Choisissez-en une plus légère.',
      );
    }
    form.append('file', blob, name);
    return form;
  }

  form.append('file', { uri, name, type: mimeType } as unknown as Blob);
  return form;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}
