import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './cash.controller';

export const cashRouter = Router();

cashRouter.get('/balance', asyncHandler(controller.getBalance));
cashRouter.get('/movements', asyncHandler(controller.listMovements));
cashRouter.get('/breakdown', asyncHandler(controller.breakdown));
cashRouter.post('/adjustments', asyncHandler(controller.adjust));
