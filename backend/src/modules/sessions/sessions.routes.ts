import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './sessions.controller';

/** Ouverture et clôture de caisse, montées sous /api/cash/sessions. */
export const sessionsRouter = Router();

const operate = requirePermission('cash.session');
const view = requirePermission('cash.view');

sessionsRouter.get(
  '/current',
  requirePermission('cash.session', 'cash.view'),
  asyncHandler(controller.current),
);
sessionsRouter.post('/open', operate, audited('cash.session_opened'), asyncHandler(controller.open));
sessionsRouter.post(
  '/close',
  operate,
  audited('cash.session_closed'),
  asyncHandler(controller.close),
);

sessionsRouter.get('/', view, asyncHandler(controller.list));
sessionsRouter.get('/:id', view, asyncHandler(controller.get));
sessionsRouter.post(
  '/:id/correct',
  requirePermission('cash.manage'),
  audited('cash.session_corrected'),
  asyncHandler(controller.correct),
);
