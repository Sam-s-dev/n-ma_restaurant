import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './notifications.service';

const listSchema = z.object({
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const readSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }),
]);

export async function listNotifications(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listSchema, req.query, 'requête');
  res.json(await service.listNotifications(user.id, input));
}

export async function markRead(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(readSchema, req.body, 'requête');
  const updated = await service.markRead(user.id, 'all' in input ? 'all' : input.ids);
  res.json({ updated });
}
