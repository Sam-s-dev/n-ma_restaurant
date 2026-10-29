import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import { agentOf, subscriptionSchema } from '../push/push.routes';
import * as service from './online.service';
import {
  placeOrderSchema,
  slugParam,
  trackingParam,
  updateOnlineSettingsSchema,
  updateZoneSchema,
  zoneSchema,
} from './online.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant de zone invalide.') });

// --- Espace restaurant ------------------------------------------------------

export async function getSettings(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.getSettings(user.restaurantId));
}

export async function updateSettings(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(updateOnlineSettingsSchema, req.body, 'requête');
  res.json(await service.updateSettings(user.restaurantId, input));
}

export async function listZones(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ data: await service.listZones(user.restaurantId) });
}

export async function createZone(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(zoneSchema, req.body, 'requête');
  res.status(201).json(await service.createZone(user.restaurantId, input));
}

export async function updateZone(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(updateZoneSchema, req.body, 'requête');
  res.json(await service.updateZone(user.restaurantId, id, input));
}

export async function deleteZone(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  await service.deleteZone(user.restaurantId, id);
  res.status(204).end();
}

// --- Mini-site public -------------------------------------------------------

export async function publicMenu(req: Request, res: Response) {
  const { slug } = parseOrThrow(slugParam, req.params, 'requête');
  res.json(await service.publicMenu(slug));
}

export async function placeOrder(req: Request, res: Response) {
  const { slug } = parseOrThrow(slugParam, req.params, 'requête');
  const input = parseOrThrow(placeOrderSchema, req.body, 'commande');
  res.status(201).json(await service.placeOrder(slug, input));
}

export async function trackOrder(req: Request, res: Response) {
  const { code } = parseOrThrow(trackingParam, req.params, 'requête');
  res.json(await service.trackOrder(code));
}

export async function subscribeToOrder(req: Request, res: Response) {
  const { code } = parseOrThrow(trackingParam, req.params, 'requête');
  const subscription = parseOrThrow(subscriptionSchema, req.body, 'requête');
  await service.subscribeToOrder(code, subscription, agentOf(req));
  res.status(204).end();
}

export async function cancelTrackedOrder(req: Request, res: Response) {
  const { code } = parseOrThrow(trackingParam, req.params, 'requête');
  res.json(await service.cancelTrackedOrder(code));
}
