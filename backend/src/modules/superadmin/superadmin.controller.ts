import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentSuperAdmin } from '../../middlewares/auth';
import * as service from './superadmin.service';
import {
  activateSchema,
  disableSchema,
  listRestaurantsSchema,
  superAdminChangePasswordSchema,
  superAdminLoginSchema,
} from './superadmin.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant de restaurant invalide.') });

export async function login(req: Request, res: Response) {
  const input = parseOrThrow(superAdminLoginSchema, req.body, 'connexion');
  const agent = req.headers['user-agent']?.slice(0, 200);
  res.json(await service.login(input.email, input.password, agent));
}

export async function me(req: Request, res: Response) {
  res.json({ admin: currentSuperAdmin(req) });
}

export async function listRestaurants(req: Request, res: Response) {
  const input = parseOrThrow(listRestaurantsSchema, req.query, 'requête');
  res.json(await service.listRestaurants(input));
}

export async function getRestaurant(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getRestaurant(id));
}

export async function activateRestaurant(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(activateSchema, req.body ?? {}, 'requête');
  res.json(await service.activateRestaurant(id, input.reason));
}

export async function disableRestaurant(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(disableSchema, req.body, 'requête');
  res.json(await service.disableRestaurant(id, input.reason));
}

export async function stats(_req: Request, res: Response) {
  res.json(await service.platformStats());
}

export async function changePassword(req: Request, res: Response) {
  const admin = currentSuperAdmin(req);
  const input = parseOrThrow(superAdminChangePasswordSchema, req.body, 'requête');
  await service.changePassword(admin.id, input.currentPassword, input.newPassword);
  res.status(204).send();
}
