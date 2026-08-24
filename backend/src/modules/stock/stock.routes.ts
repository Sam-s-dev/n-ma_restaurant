import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './stock.controller';

export const stockRouter = Router();

stockRouter.get('/units', asyncHandler(controller.units));
stockRouter.get('/alerts', asyncHandler(controller.alerts));

stockRouter.get('/', asyncHandler(controller.listItems));
stockRouter.post('/', asyncHandler(controller.createItem));
stockRouter.get('/:id', asyncHandler(controller.getItem));
stockRouter.patch('/:id', asyncHandler(controller.updateItem));
stockRouter.delete('/:id', asyncHandler(controller.deleteItem));

// Correction d'inventaire / perte (l'achat passe par les dépenses, §9).
stockRouter.post('/:id/adjustments', asyncHandler(controller.adjustStock));
stockRouter.get('/:id/movements', asyncHandler(controller.listMovements));
