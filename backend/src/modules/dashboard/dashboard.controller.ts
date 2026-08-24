import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './dashboard.service';
import { getCharts } from './dashboard.charts';

const trendSchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) });

export async function summary(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.getSummary(user.restaurantId));
}

export async function trend(req: Request, res: Response) {
  const user = currentUser(req);
  const { days } = parseOrThrow(trendSchema, req.query, 'requête');
  res.json({ items: await service.getDailyTrend(user.restaurantId, days) });
}

/** Toutes les séries des graphiques du tableau de bord, en un seul appel. */
export async function charts(req: Request, res: Response) {
  const user = currentUser(req);
  const { days } = parseOrThrow(trendSchema, req.query, 'requête');
  res.json(await getCharts(user.restaurantId, days));
}
