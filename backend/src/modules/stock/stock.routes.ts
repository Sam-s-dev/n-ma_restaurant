import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './stock.controller';

export const stockRouter = Router();

stockRouter.use(requirePermission('stock.view'));
const manage = requirePermission('stock.manage');

stockRouter.get('/units', asyncHandler(controller.units));
stockRouter.get('/alerts', asyncHandler(controller.alerts));

stockRouter.get('/', asyncHandler(controller.listItems));
stockRouter.post('/', manage, asyncHandler(controller.createItem));
stockRouter.get('/:id', asyncHandler(controller.getItem));
stockRouter.patch('/:id', manage, asyncHandler(controller.updateItem));
stockRouter.delete(
  '/:id',
  manage,
  audited('stock_item.deleted'),
  asyncHandler(controller.deleteItem),
);

// Correction d'inventaire / perte (l'achat passe par les dépenses, §9).
stockRouter.post(
  '/:id/adjustments',
  manage,
  audited('stock.adjusted'),
  asyncHandler(controller.adjustStock),
);
stockRouter.get('/:id/movements', asyncHandler(controller.listMovements));
