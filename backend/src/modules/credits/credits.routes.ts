import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './credits.controller';

export const creditsRouter = Router();

creditsRouter.get('/summary', asyncHandler(controller.summary));
creditsRouter.get('/', asyncHandler(controller.listCredits));
creditsRouter.get('/:id', asyncHandler(controller.getCredit));
creditsRouter.post('/:id/payments', asyncHandler(controller.repayCredit));
