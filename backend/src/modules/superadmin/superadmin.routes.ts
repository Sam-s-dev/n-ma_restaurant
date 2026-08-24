import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { requireSuperAdmin } from '../../middlewares/auth';
import { superAdminRateLimit } from '../../middlewares/rateLimit';
import * as controller from './superadmin.controller';

export const superAdminRouter = Router();

superAdminRouter.post('/login', superAdminRateLimit, asyncHandler(controller.login));

superAdminRouter.use(requireSuperAdmin);

superAdminRouter.get('/me', asyncHandler(controller.me));
superAdminRouter.post('/change-password', asyncHandler(controller.changePassword));
superAdminRouter.get('/stats', asyncHandler(controller.stats));

superAdminRouter.get('/restaurants', asyncHandler(controller.listRestaurants));
superAdminRouter.get('/restaurants/:id', asyncHandler(controller.getRestaurant));
superAdminRouter.post('/restaurants/:id/activate', asyncHandler(controller.activateRestaurant));
superAdminRouter.post('/restaurants/:id/disable', asyncHandler(controller.disableRestaurant));
