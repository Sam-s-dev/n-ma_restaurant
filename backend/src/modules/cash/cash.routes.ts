import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './cash.controller';

export const cashRouter = Router();

const view = requirePermission('cash.view');
const manage = requirePermission('cash.manage');

// Le solde seul est ouvert au magasinier : il calibre ses demandes d'achat
// sans voir le détail des mouvements.
cashRouter.get(
  '/balance',
  requirePermission('cash.view', 'cash.balance'),
  asyncHandler(controller.getBalance),
);
cashRouter.get('/movements', view, asyncHandler(controller.listMovements));
cashRouter.get('/breakdown', view, asyncHandler(controller.breakdown));
cashRouter.post('/adjustments', manage, audited('cash.adjusted'), asyncHandler(controller.adjust));
cashRouter.post(
  '/contributions',
  manage,
  audited('cash.contribution'),
  asyncHandler(controller.contribute),
);
