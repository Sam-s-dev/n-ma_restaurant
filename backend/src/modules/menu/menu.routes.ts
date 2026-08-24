import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './menu.controller';

export const menuRouter = Router();

// Catégories (§5)
menuRouter.get('/categories', asyncHandler(controller.listCategories));
menuRouter.post('/categories', asyncHandler(controller.createCategory));
menuRouter.patch('/categories/:id', asyncHandler(controller.updateCategory));
menuRouter.delete('/categories/:id', asyncHandler(controller.deleteCategory));

// Plats (§5)
menuRouter.get('/dishes', asyncHandler(controller.listDishes));
menuRouter.post('/dishes', asyncHandler(controller.createDish));
menuRouter.get('/dishes/:id', asyncHandler(controller.getDish));
menuRouter.patch('/dishes/:id', asyncHandler(controller.updateDish));
menuRouter.patch('/dishes/:id/availability', asyncHandler(controller.setAvailability));
menuRouter.delete('/dishes/:id', asyncHandler(controller.deleteDish));
