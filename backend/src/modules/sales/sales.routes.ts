import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './sales.controller';

export const salesRouter = Router();

salesRouter.get('/top-dishes', asyncHandler(controller.topDishes));

salesRouter.get('/', asyncHandler(controller.listSales));
salesRouter.post('/', asyncHandler(controller.createSale));
salesRouter.get('/:id', asyncHandler(controller.getSale));
salesRouter.get('/:id/receipt', asyncHandler(controller.getReceipt));
salesRouter.post('/:id/cancel', asyncHandler(controller.cancelSale));
