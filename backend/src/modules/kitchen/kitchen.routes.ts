import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/asyncHandler';
import { parseOrThrow } from '../../core/validate';
import { currentUser, requirePermission } from '../../middlewares/auth';
import * as service from './kitchen.service';

const idParam = z.object({ id: z.string().uuid('Identifiant de ticket invalide.') });
const itemSchema = z.object({ itemId: z.string().uuid('Plat invalide.').optional() });

function actorOf(req: Request) {
  const user = currentUser(req);
  return { restaurantId: user.restaurantId, userId: user.id, userName: user.fullName };
}

/** L'écran cuisine. Chaque action renvoie l'écran à jour, sans second appel. */
export const kitchenRouter = Router();

kitchenRouter.use(requirePermission('kitchen.handle'));

kitchenRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await service.listKitchen(currentUser(req).restaurantId));
  }),
);

kitchenRouter.post(
  '/tickets/:id/start',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseOrThrow(idParam, req.params, 'requête');
    res.json(await service.startTicket(actorOf(req), id));
  }),
);

/** Tout le ticket, ou un seul plat avec `{ itemId }`. */
kitchenRouter.post(
  '/tickets/:id/ready',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseOrThrow(idParam, req.params, 'requête');
    const { itemId } = parseOrThrow(itemSchema, req.body ?? {}, 'requête');
    res.json(await service.markItemsReady(actorOf(req), id, itemId));
  }),
);
