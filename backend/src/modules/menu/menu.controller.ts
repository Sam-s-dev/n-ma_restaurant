import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './menu.service';
import {
  createCategorySchema,
  createDishSchema,
  listDishesSchema,
  setAvailabilitySchema,
  updateCategorySchema,
  updateDishSchema,
} from './menu.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant invalide.') });

// --- Catégories ----------------------------------------------------------

export async function listCategories(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ items: await service.listCategories(user.restaurantId) });
}

export async function createCategory(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createCategorySchema, req.body, 'catégorie');
  res.status(201).json(await service.createCategory(user.restaurantId, input));
}

export async function updateCategory(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(updateCategorySchema, req.body, 'catégorie');
  res.json(await service.updateCategory(user.restaurantId, id, input));
}

export async function deleteCategory(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  await service.deleteCategory(user.restaurantId, id);
  res.status(204).send();
}

// --- Plats ---------------------------------------------------------------

export async function listDishes(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listDishesSchema, req.query, 'requête');
  res.json({ items: await service.listDishes(user.restaurantId, input) });
}

export async function getDish(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getDish(user.restaurantId, id));
}

export async function createDish(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createDishSchema, req.body, 'plat');
  res.status(201).json(await service.createDish(user.restaurantId, input));
}

export async function updateDish(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(updateDishSchema, req.body, 'plat');
  res.json(await service.updateDish(user.restaurantId, id, input));
}

export async function setAvailability(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(setAvailabilitySchema, req.body, 'requête');
  res.json(await service.setAvailability(user.restaurantId, id, input.isAvailable));
}

export async function deleteDish(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  await service.archiveDish(user.restaurantId, id);
  res.status(204).send();
}
