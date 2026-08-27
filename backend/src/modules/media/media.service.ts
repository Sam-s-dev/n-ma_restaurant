import { createHash } from 'node:crypto';
import { badRequest, notFound } from '../../core/errors';
import { query, queryOne } from '../../db/pool';

const SIGNATURES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/**
 * Le type MIME est déduit du contenu réel du fichier, pas de l'en-tête
 * déclaré par le client : un exécutable renommé en .jpg est rejeté.
 */
function detectMime(buffer: Buffer): string {
  if (buffer.length < 12) throw badRequest('Fichier image invalide ou tronqué.');
  const found = SIGNATURES.find((s) => s.test(buffer));
  if (!found) throw badRequest('Format non supporté. Utilisez JPEG, PNG ou WebP.');
  return found.mime;
}

export interface StoredMedia {
  id: string;
  mimeType: string;
  byteSize: number;
  url: string;
}

export async function storeMedia(
  restaurantId: string | null,
  buffer: Buffer,
): Promise<StoredMedia> {
  const mimeType = detectMime(buffer);
  const checksum = createHash('sha256').update(buffer).digest('hex');

  // Déduplication : la même photo envoyée deux fois ne double pas le stockage.
  const existing = await queryOne<{ id: string; mime_type: string; byte_size: number }>(
    `SELECT id, mime_type, byte_size FROM media
      WHERE checksum = $1 AND restaurant_id IS NOT DISTINCT FROM $2
      LIMIT 1`,
    [checksum, restaurantId],
  );
  if (existing) {
    return {
      id: existing.id,
      mimeType: existing.mime_type,
      byteSize: existing.byte_size,
      url: `/api/media/${existing.id}`,
    };
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO media (restaurant_id, mime_type, byte_size, checksum, content)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [restaurantId, mimeType, buffer.byteLength, checksum, buffer],
  );
  if (!row) throw new Error('Enregistrement du média impossible.');

  return { id: row.id, mimeType, byteSize: buffer.byteLength, url: `/api/media/${row.id}` };
}

export async function readMedia(
  id: string,
): Promise<{ content: Buffer; mimeType: string; checksum: string }> {
  const row = await queryOne<{ content: Buffer; mime_type: string; checksum: string }>(
    'SELECT content, mime_type, checksum FROM media WHERE id = $1',
    [id],
  );
  if (!row) throw notFound('Image');
  return { content: row.content, mimeType: row.mime_type, checksum: row.checksum };
}

/**
 * Largeurs de vignettes acceptées.
 *
 * La liste est fermée, et c'est le point important : une largeur libre
 * laisserait n'importe qui fabriquer des milliers de variantes en bouclant
 * sur `?w=1,2,3…`, chacune stockée en base. Trois tailles couvrent tous les
 * usages de l'application — la pastille d'un écran de liste, la vignette
 * d'un plat dans la grille de vente, et l'affichage en pleine largeur.
 */
const ALLOWED_WIDTHS = [96, 320, 720] as const;

export function isAllowedWidth(width: number): boolean {
  return (ALLOWED_WIDTHS as readonly number[]).includes(width);
}

/**
 * Réduction d'image, chargée à la demande.
 *
 * `sharp` embarque un binaire natif. S'il venait à manquer — image de base
 * changée, architecture inattendue — un import en tête de fichier ferait
 * tomber l'API entière au démarrage. Chargé ici, l'échec reste local : on
 * sert alors l'original, exactement comme avant cette fonctionnalité.
 */
async function shrink(
  content: Buffer,
  width: number,
): Promise<{ content: Buffer; mimeType: string } | null> {
  try {
    const { default: sharp } = await import('sharp');
    const resized = await sharp(content)
      .rotate() // Respecte l'orientation EXIF, sinon les photos prises de côté sortent couchées.
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return { content: resized, mimeType: 'image/webp' };
  } catch {
    return null;
  }
}

/**
 * Version réduite d'une image, fabriquée à la première demande puis
 * conservée. Les appels suivants la relisent sans retoucher au pixel.
 *
 * Si la réduction échoue — format exotique, binaire absent — on renvoie
 * l'original : une image lourde vaut mieux qu'un cadre vide.
 */
export async function readMediaVariant(
  id: string,
  width: number,
): Promise<{ content: Buffer; mimeType: string; checksum: string }> {
  const cached = await queryOne<{ content: Buffer; mime_type: string; checksum: string }>(
    'SELECT content, mime_type, checksum FROM media_variants WHERE media_id = $1 AND width = $2',
    [id, width],
  );
  if (cached) {
    return { content: cached.content, mimeType: cached.mime_type, checksum: cached.checksum };
  }

  const original = await readMedia(id);
  const smaller = await shrink(original.content, width);
  if (!smaller) return original;

  const checksum = createHash('sha256').update(smaller.content).digest('hex');

  // `ON CONFLICT DO NOTHING` : deux appareils qui ouvrent l'écran en même
  // temps demandent la même vignette, et la fabriquent tous les deux. Le
  // second arrive après le premier — ce n'est pas une erreur, le contenu
  // est identique.
  await query(
    `INSERT INTO media_variants (media_id, width, mime_type, byte_size, checksum, content)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (media_id, width) DO NOTHING`,
    [id, width, smaller.mimeType, smaller.content.byteLength, checksum, smaller.content],
  );

  return { content: smaller.content, mimeType: smaller.mimeType, checksum };
}

/**
 * Supprime les images d'un restaurant qui ne sont plus référencées.
 * Appelé après un changement de logo ou de photo de plat.
 */
export async function pruneOrphans(restaurantId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM media m
      WHERE m.restaurant_id = $1
        AND NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.logo_media_id  = m.id)
        AND NOT EXISTS (SELECT 1 FROM dishes d      WHERE d.photo_media_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM employees e   WHERE e.photo_media_id = m.id)
        AND m.created_at < now() - interval '1 hour'
      RETURNING m.id`,
    [restaurantId],
  );
  return rows.length;
}
