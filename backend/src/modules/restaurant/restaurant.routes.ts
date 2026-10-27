import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './restaurant.controller';

export const restaurantRouter = Router();

// Lecture ouverte à tous : nom, adresse et devise servent sur chaque écran.
restaurantRouter.get('/', asyncHandler(controller.getSettings));
restaurantRouter.patch(
  '/',
  requirePermission('settings.manage'),
  audited('settings.updated'),
  asyncHandler(controller.updateSettings),
);
