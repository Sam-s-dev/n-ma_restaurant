import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { can, currentUser } from '../../middlewares/auth';
import * as service from './sessions.service';
import type { CashSession } from './sessions.service';
import { closeSessionSchema, listSessionsSchema, openSessionSchema } from './sessions.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant de session invalide.') });

function actorOf(req: Request) {
  const user = currentUser(req);
  return { restaurantId: user.restaurantId, userId: user.id, userName: user.fullName };
}

/**
 * Comptage à l'aveugle : qui n'a pas accès à la caisse détaillée ne voit ni
 * l'attendu, ni l'écart, ni les chiffres de la journée. Il voit ce qu'il a
 * lui-même compté, et que la clôture est enregistrée.
 */
function visibleTo(req: Request, session: CashSession): Partial<CashSession> {
  if (can(req, 'cash.view')) return session;
  return {
    id: session.id,
    reference: session.reference,
    status: session.status,
    openedByName: session.openedByName,
    openedAt: session.openedAt,
    openingFloat: session.openingFloat,
    closedByName: session.closedByName,
    closedAt: session.closedAt,
    countedCash: session.countedCash,
    countedMobileMoney: session.countedMobileMoney,
  };
}

export async function current(req: Request, res: Response) {
  const user = currentUser(req);
  const session = await service.getOpenSession(user.restaurantId);
  res.json({ session: session ? visibleTo(req, session) : null });
}

export async function open(req: Request, res: Response) {
  const input = parseOrThrow(openSessionSchema, req.body, 'ouverture');
  const session = await service.openSession(actorOf(req), input);
  res.status(201).json(visibleTo(req, session));
}

export async function close(req: Request, res: Response) {
  const input = parseOrThrow(closeSessionSchema, req.body, 'clôture');
  const session = await service.closeSession(actorOf(req), input);
  res.json(visibleTo(req, session));
}

export async function list(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listSessionsSchema, req.query, 'requête');
  res.json(await service.listSessions(user.restaurantId, input));
}

export async function get(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getSession(user.restaurantId, id));
}

export async function correct(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.correctSession(actorOf(req), id));
}
