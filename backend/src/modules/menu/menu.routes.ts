import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './menu.controller';

export const menuRouter = Router();

const view = requirePermission('menu.view');
const manage = requirePermission('menu.manage');

// Catégories (§5)
menuRouter.get('/categories', view, asyncHandler(controller.listCategories));
menuRouter.post('/categories', manage, asyncHandler(controller.createCategory));
menuRouter.patch('/categories/:id', manage, asyncHandler(controller.updateCategory));
menuRouter.delete('/categories/:id', manage, asyncHandler(controller.deleteCategory));

// Plats (§5)
menuRouter.get('/dishes', view, asyncHandler(controller.listDishes));
menuRouter.post('/dishes', manage, audited('dish.created'), asyncHandler(controller.createDish));
menuRouter.get('/dishes/:id', view, asyncHandler(controller.getDish));
menuRouter.patch(
  '/dishes/:id',
  manage,
  audited('dish.updated'),
  asyncHandler(controller.updateDish),
);
// Le caissier signale qu'un plat est épuisé, sans pouvoir toucher au prix.
menuRouter.patch(
  '/dishes/:id/availability',
  requirePermission('menu.availability'),
  asyncHandler(controller.setAvailability),
);
menuRouter.delete(
  '/dishes/:id',
  manage,
  audited('dish.deleted'),
  asyncHandler(controller.deleteDish),
);
