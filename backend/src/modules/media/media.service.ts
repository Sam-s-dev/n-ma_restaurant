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
