import type { Request, Response } from 'express';
import { z } from 'zod';
import { forbidden } from '../../core/errors';
import { parseOrThrow } from '../../core/validate';
import { can, currentUser } from '../../middlewares/auth';
import { requireOpenSessionUnlessManager } from '../sessions/sessions.guard';
import * as service from './tables.service';
import {
  createTableSchema,
  createTablesBatchSchema,
  kitchenSettingsSchema,
  listBillsSchema,
  openBillSchema,
  payBillSchema,
  reasonSchema,
  sendItemsSchema,
  updateTableSchema,
} from './tables.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant invalide.') });
const idOf = (req: Request) => parseOrThrow(idParam, req.params, 'requête').id;

function actorOf(req: Request): service.Actor {
  const user = currentUser(req);
  return { restaurantId: user.restaurantId, userId: user.id, userName: user.fullName };
}

// --- Plan de salle ----------------------------------------------------------

export async function listTables(req: Request, res: Response) {
  const user = currentUser(req);
  const all = req.query.all === 'true' && can(req, 'settings.manage');
  res.json({ data: await service.listTables(user.restaurantId, all) });
}

export async function createTable(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createTableSchema, req.body, 'requête');
  res.status(201).json(await service.createTable(user.restaurantId, input));
}

export async function createTablesBatch(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createTablesBatchSchema, req.body, 'requête');
  res.status(201).json(await service.createTablesBatch(user.restaurantId, input.count, input.area ?? null));
}

export async function updateTable(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(updateTableSchema, req.body, 'requête');
  await service.updateTable(user.restaurantId, idOf(req), input);
  res.status(204).end();
}

export async function deleteTable(req: Request, res: Response) {
  const user = currentUser(req);
  await service.deleteTable(user.restaurantId, idOf(req));
  res.status(204).end();
}

export async function getKitchenSettings(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.getKitchenSettings(user.restaurantId));
}

export async function updateKitchenSettings(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(kitchenSettingsSchema, req.body, 'requête');
  res.json(await service.updateKitchenSettings(user.restaurantId, input.warnMinutes, input.lateMinutes));
}

// --- Additions --------------------------------------------------------------

export async function openBill(req: Request, res: Response) {
  const input = parseOrThrow(openBillSchema, req.body ?? {}, 'requête');
  res.status(201).json(await service.openBill(actorOf(req), idOf(req), input));
}

export async function listBills(req: Request, res: Response) {
  const user = currentUser(req);
  const { status } = parseOrThrow(listBillsSchema, req.query, 'requête');
  res.json({ data: await service.listBills(user.restaurantId, status) });
}

export async function getBill(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.getBill(user.restaurantId, idOf(req)));
}

export async function sendItems(req: Request, res: Response) {
  const input = parseOrThrow(sendItemsSchema, req.body, 'commande');
  res.json(await service.sendItems(actorOf(req), idOf(req), input));
}

export async function requestBill(req: Request, res: Response) {
  res.json(await service.requestBill(actorOf(req), idOf(req)));
}

/** Comme toute vente du caissier : il faut une caisse ouverte. */
export async function payBill(req: Request, res: Response) {
  const actor = actorOf(req);
  const id = idOf(req);
  const input = parseOrThrow(payBillSchema, req.body, 'requête');
  if (input.paymentMethod === 'credit' && !can(req, 'credits.view')) {
    throw forbidden('Votre rôle ne permet pas la vente à crédit.');
  }
  await requireOpenSessionUnlessManager(req, actor.restaurantId);
  res.json(await service.payBill(actor, id, input));
}

export async function cancelBill(req: Request, res: Response) {
  const { reason } = parseOrThrow(reasonSchema, req.body, 'requête');
  res.json(await service.cancelBill(actorOf(req), idOf(req), reason));
}

export async function markServed(req: Request, res: Response) {
  res.json(await service.markServed(actorOf(req), idOf(req)));
}

export async function cancelItem(req: Request, res: Response) {
  const { reason } = parseOrThrow(reasonSchema, req.body, 'requête');
  res.json(await service.cancelItem(actorOf(req), idOf(req), reason));
}
