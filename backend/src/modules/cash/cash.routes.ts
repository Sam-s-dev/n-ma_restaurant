import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './cash.controller';

export const cashRouter = Router();

const view = requirePermission('cash.view');
const manage = requirePermission('cash.manage');

cashRouter.get('/balance', view, asyncHandler(controller.getBalance));
cashRouter.get('/movements', view, asyncHandler(controller.listMovements));
cashRouter.get('/breakdown', view, asyncHandler(controller.breakdown));
cashRouter.post('/adjustments', manage, audited('cash.adjusted'), asyncHandler(controller.adjust));
cashRouter.post(
  '/contributions',
  manage,
  audited('cash.contribution'),
  asyncHandler(controller.contribute),
);
