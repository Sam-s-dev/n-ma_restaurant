import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', asyncHandler(controller.summary));
dashboardRouter.get('/trend', asyncHandler(controller.trend));
dashboardRouter.get('/charts', asyncHandler(controller.charts));
