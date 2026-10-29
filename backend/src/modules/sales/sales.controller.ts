import type { Request, Response } from 'express';
import { z } from 'zod';
import { forbidden } from '../../core/errors';
import { dateRangeSchema } from '../../core/pagination';
import { parseOrThrow } from '../../core/validate';
import { can, currentUser } from '../../middlewares/auth';
import { requireOpenSessionUnlessManager } from '../sessions/sessions.guard';
import * as service from './sales.service';
import { cancelSaleSchema, createSaleSchema, listSalesSchema, syncSalesSchema } from './sales.schemas';
import { syncOfflineSales } from './sales.sync';

const idParam = z.object({ id: z.string().uuid('Identifiant de vente invalide.') });

export async function createSale(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createSaleSchema, req.body, 'vente');

  // Un prix libre ou une date passée changent ce que la caisse aurait dû
  // recevoir : décision du gérant, pas du caissier.
  const overridesPrice = input.items.some((item) => item.unitPrice !== undefined);
  if ((overridesPrice || input.soldAt) && !can(req, 'sales.discount')) {
    throw forbidden('Seul le gérant peut modifier un prix ou antidater une vente.');
  }
  await requireOpenSessionUnlessManager(req, user.restaurantId);

  res.status(201).json(await service.createSale(user.restaurantId, user.id, input));
}

/**
 * Ventes faites pendant une coupure d'internet. Pas d'exigence de caisse
 * ouverte : la vente a déjà eu lieu, la refuser la ferait disparaître.
 */
export async function syncSales(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(syncSalesSchema, req.body, 'requête');
  res.json(
    await syncOfflineSales(
      {
        restaurantId: user.restaurantId,
        userId: user.id,
        userName: user.fullName,
        isManager: can(req, 'cash.manage'),
        canOverridePrice: can(req, 'sales.discount'),
      },
      input,
    ),
  );
}

export async function listSales(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listSalesSchema, req.query, 'requête');
  const onlyOwn = can(req, 'sales.view_all') ? undefined : user.id;
  res.json(await service.listSales(user.restaurantId, input, onlyOwn));
}

export async function getSale(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  if (!can(req, 'sales.view_all')) await service.assertSaleAuthor(user.restaurantId, id, user.id);
  res.json(await service.getSale(user.restaurantId, id));
}

export async function getReceipt(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  if (!can(req, 'sales.view_all')) await service.assertSaleAuthor(user.restaurantId, id, user.id);
  res.json(await service.getReceipt(user.restaurantId, id));
}

export async function cancelSale(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(cancelSaleSchema, req.body, 'requête');
  res.json(
    await service.cancelSale(user.restaurantId, id, user.id, input.reason, user.fullName),
  );
}

export async function topDishes(req: Request, res: Response) {
  const user = currentUser(req);
  const range = parseOrThrow(dateRangeSchema, req.query, 'requête');
  res.json({ items: await service.topDishes(user.restaurantId, range.from, range.to) });
}
