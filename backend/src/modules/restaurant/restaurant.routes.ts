import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './restaurant.controller';

export const restaurantRouter = Router();

restaurantRouter.get('/', asyncHandler(controller.getSettings));
restaurantRouter.patch('/', asyncHandler(controller.updateSettings));
