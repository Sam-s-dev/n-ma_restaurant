import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './credits.controller';

export const creditsRouter = Router();

creditsRouter.use(requirePermission('credits.view'));

creditsRouter.get('/summary', asyncHandler(controller.summary));
creditsRouter.get('/', asyncHandler(controller.listCredits));
creditsRouter.get('/:id', asyncHandler(controller.getCredit));
creditsRouter.post(
  '/:id/payments',
  requirePermission('credits.repay'),
  audited('credit.repaid'),
  asyncHandler(controller.repayCredit),
);
