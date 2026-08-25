import type { Request, Response } from 'express';
import { parseOrThrow } from '../../core/validate';
import { dateRangeSchema } from '../../core/pagination';
import { currentUser } from '../../middlewares/auth';
import * as service from './cash.service';
import { adjustCashSchema, contributeCashSchema, listMovementsSchema } from './cash.schemas';

export async function getBalance(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.getBalance(user.restaurantId));
}

export async function listMovements(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listMovementsSchema, req.query, 'requête');
  res.json(await service.listMovements(user.restaurantId, input));
}

export async function adjust(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(adjustCashSchema, req.body, 'requête');
  res.status(201).json(await service.adjust(user.restaurantId, user.id, input));
}

/** §7 — Apport de capital du gérant, distinct d'une correction de saisie. */
export async function contribute(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(contributeCashSchema, req.body, 'apport');
  res.status(201).json(await service.contribute(user.restaurantId, user.id, input));
}

export async function breakdown(req: Request, res: Response) {
  const user = currentUser(req);
  const range = parseOrThrow(dateRangeSchema, req.query, 'requête');
  res.json({ items: await service.paymentBreakdown(user.restaurantId, range.from, range.to) });
}
