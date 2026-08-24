import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './stock.service';
import {
  adjustStockSchema,
  createStockItemSchema,
  listStockSchema,
  updateStockItemSchema,
  STOCK_UNITS,
} from './stock.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant invalide.') });

export async function listItems(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listStockSchema, req.query, 'requête');
  res.json(await service.listItems(user.restaurantId, input));
}

export async function getItem(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getItem(user.restaurantId, id));
}

export async function createItem(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createStockItemSchema, req.body, 'produit');
  res.status(201).json(await service.createItem(user.restaurantId, user.id, input));
}

export async function updateItem(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(updateStockItemSchema, req.body, 'produit');
  res.json(await service.updateItem(user.restaurantId, id, input));
}

export async function adjustStock(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(adjustStockSchema, req.body, 'requête');
  res.json(await service.adjustStock(user.restaurantId, id, user.id, input));
}

export async function listMovements(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json({ items: await service.listMovements(user.restaurantId, id) });
}

export async function deleteItem(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  await service.archiveItem(user.restaurantId, id);
  res.status(204).send();
}

export async function alerts(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ items: await service.lowStockAlerts(user.restaurantId) });
}

export async function units(_req: Request, res: Response) {
  res.json({ items: STOCK_UNITS });
}
