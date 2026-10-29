import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './sales.controller';

export const salesRouter = Router();

salesRouter.get(
  '/top-dishes',
  requirePermission('dashboard.view'),
  asyncHandler(controller.topDishes),
);

// Lecture ouverte à qui vend : le contrôleur limite le caissier à ses
// propres ventes.
const sell = requirePermission('sales.create');

salesRouter.get('/', sell, asyncHandler(controller.listSales));
salesRouter.post('/', sell, asyncHandler(controller.createSale));
salesRouter.post('/sync', sell, audited('sale.offline_synced'), asyncHandler(controller.syncSales));
salesRouter.get('/:id', sell, asyncHandler(controller.getSale));
salesRouter.get('/:id/receipt', sell, asyncHandler(controller.getReceipt));
salesRouter.post(
  '/:id/cancel',
  requirePermission('sales.cancel'),
  audited('sale.cancelled'),
  asyncHandler(controller.cancelSale),
);
