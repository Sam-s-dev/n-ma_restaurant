import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './credits.service';
import { listCreditsSchema, repayCreditSchema } from './credits.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant de créance invalide.') });

export async function listCredits(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listCreditsSchema, req.query, 'requête');
  res.json(await service.listCredits(user.restaurantId, input));
}

export async function getCredit(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getCredit(user.restaurantId, id));
}

export async function repayCredit(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(repayCreditSchema, req.body, 'remboursement');
  res.status(201).json(await service.repayCredit(user.restaurantId, id, user.id, input));
}

export async function summary(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ totalOutstanding: await service.totalOutstanding(user.restaurantId) });
}
