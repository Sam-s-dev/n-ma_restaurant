import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import { requireOpenSessionUnlessManager } from '../sessions/sessions.guard';
import * as service from './orders.service';

const idParam = z.object({ id: z.string().uuid('Identifiant de commande invalide.') });
const listSchema = z.object({
  group: z.enum(['active', 'to_settle', 'closed']).default('active'),
});
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Indiquez le motif.').max(300) });
const assignSchema = z.object({ driverId: z.string().uuid('Livreur invalide.') });
const method = z.enum(['cash', 'mobile_money']);
const completeSchema = z.object({ paymentMethod: method.optional() });
const deliverSchema = z.object({ collectedMethod: method });
const issueSchema = z.object({ issue: z.string().trim().min(3, 'Décrivez le problème.').max(300) });

function actorOf(req: Request): service.Actor {
  const user = currentUser(req);
  return { restaurantId: user.restaurantId, userId: user.id, userName: user.fullName };
}

const idOf = (req: Request) => parseOrThrow(idParam, req.params, 'requête').id;

// --- Restaurant -------------------------------------------------------------

export async function listOrders(req: Request, res: Response) {
  const user = currentUser(req);
  const { group } = parseOrThrow(listSchema, req.query, 'requête');
  res.json(await service.listOrders(user.restaurantId, group));
}

export async function listDrivers(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ data: await service.listDrivers(user.restaurantId) });
}

export async function getOrder(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.loadOrder(user.restaurantId, idOf(req)));
}

export async function acceptOrder(req: Request, res: Response) {
  res.json(await service.acceptOrder(actorOf(req), idOf(req)));
}

export async function rejectOrder(req: Request, res: Response) {
  const { reason } = parseOrThrow(reasonSchema, req.body, 'requête');
  res.json(await service.rejectOrder(actorOf(req), idOf(req), reason));
}

export async function markReady(req: Request, res: Response) {
  res.json(await service.markReady(actorOf(req), idOf(req)));
}

export async function assignDriver(req: Request, res: Response) {
  const { driverId } = parseOrThrow(assignSchema, req.body, 'requête');
  res.json(await service.assignDriver(actorOf(req), idOf(req), driverId));
}

export async function cancelOrder(req: Request, res: Response) {
  const { reason } = parseOrThrow(reasonSchema, req.body, 'requête');
  res.json(await service.cancelOrder(actorOf(req), idOf(req), reason));
}

/** L'argent entre en caisse : comme toute vente du caissier, il faut une caisse ouverte. */
export async function completeOrder(req: Request, res: Response) {
  const actor = actorOf(req);
  const id = idOf(req);
  const { paymentMethod } = parseOrThrow(completeSchema, req.body ?? {}, 'requête');
  await requireOpenSessionUnlessManager(req, actor.restaurantId);
  res.json(await service.completeOrder(actor, id, paymentMethod));
}

// --- Livreur ----------------------------------------------------------------

export async function myDeliveries(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.listMyDeliveries(user.restaurantId, user.id));
}

export async function dispatchOrder(req: Request, res: Response) {
  res.json(await service.dispatchOrder(actorOf(req), idOf(req)));
}

export async function deliverOrder(req: Request, res: Response) {
  const { collectedMethod } = parseOrThrow(deliverSchema, req.body, 'requête');
  res.json(await service.deliverOrder(actorOf(req), idOf(req), collectedMethod));
}

export async function reportIssue(req: Request, res: Response) {
  const { issue } = parseOrThrow(issueSchema, req.body, 'requête');
  res.json(await service.reportIssue(actorOf(req), idOf(req), issue));
}
