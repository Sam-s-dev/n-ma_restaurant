import type { Request, Response } from 'express';
import { z } from 'zod';
import { dateRangeSchema } from '../../core/pagination';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './sales.service';
import { cancelSaleSchema, createSaleSchema, listSalesSchema } from './sales.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant de vente invalide.') });

export async function createSale(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createSaleSchema, req.body, 'vente');
  res.status(201).json(await service.createSale(user.restaurantId, user.id, input));
}

export async function listSales(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listSalesSchema, req.query, 'requête');
  res.json(await service.listSales(user.restaurantId, input));
}

export async function getSale(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getSale(user.restaurantId, id));
}

export async function getReceipt(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getReceipt(user.restaurantId, id));
}

export async function cancelSale(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(cancelSaleSchema, req.body, 'requête');
  res.json(await service.cancelSale(user.restaurantId, id, user.id, input.reason));
}

export async function topDishes(req: Request, res: Response) {
  const user = currentUser(req);
  const range = parseOrThrow(dateRangeSchema, req.query, 'requête');
  res.json({ items: await service.topDishes(user.restaurantId, range.from, range.to) });
}
