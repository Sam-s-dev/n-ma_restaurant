import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../../core/errors';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './media.service';

const idParam = z.object({ id: z.string().uuid('Identifiant d’image invalide.') });

export async function upload(req: Request, res: Response) {
  const user = currentUser(req);
  if (!req.file) throw badRequest('Aucun fichier reçu (champ attendu : `file`).');
  res.status(201).json(await service.storeMedia(user.restaurantId, req.file.buffer));
}

/**
 * Lecture publique : l'identifiant est un UUID aléatoire non énumérable,
 * ce qui permet à l'application mobile d'afficher les images dans un
 * composant <Image> standard sans gérer d'en-tête d'authentification.
 */
export async function download(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const media = await service.readMedia(id);

  const etag = `"${media.checksum}"`;
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', etag);
  res.send(media.content);
}
