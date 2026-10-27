import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../../core/errors';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './reports.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');
const periodSchema = z.object({ from: isoDate, to: isoDate });

function periodOf(req: Request): service.Period {
  const period = parseOrThrow(periodSchema, req.query, 'requête');
  if (period.from > period.to) throw badRequest('La date de début doit précéder la date de fin.');
  // Un an suffit pour un export ; au-delà, le fichier deviendrait illisible.
  const days = (Date.parse(period.to) - Date.parse(period.from)) / 86_400_000;
  if (days > 366) throw badRequest('Choisissez une période d’un an au plus.');
  return period;
}

export async function summary(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.periodReport(user.restaurantId, periodOf(req)));
}

export async function exportXlsx(req: Request, res: Response) {
  const user = currentUser(req);
  const period = periodOf(req);
  const buffer = await service.exportWorkbook(user.restaurantId, period);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="nma-export-${period.from}-au-${period.to}.xlsx"`,
  );
  res.send(buffer);
}
