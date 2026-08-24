import type { Request, Response } from 'express';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './restaurant.service';
import { updateRestaurantSchema } from './restaurant.schemas';

export async function getSettings(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.getSettings(user.restaurantId));
}

export async function updateSettings(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(updateRestaurantSchema, req.body, 'requête');
  res.json(await service.updateSettings(user.restaurantId, input));
}
