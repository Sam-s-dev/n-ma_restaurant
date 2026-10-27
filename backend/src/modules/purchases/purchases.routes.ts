import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './purchases.controller';

export const purchasesRouter = Router();

// Le demandeur voit ses demandes, le gérant les voit toutes (filtrage au
// niveau du service).
purchasesRouter.use(requirePermission('purchases.request', 'purchases.approve'));
const request = requirePermission('purchases.request');
const approve = requirePermission('purchases.approve');

purchasesRouter.get('/', asyncHandler(controller.listRequests));
purchasesRouter.post('/', request, audited('purchase.requested'), asyncHandler(controller.createRequest));
purchasesRouter.get('/:id', asyncHandler(controller.getRequest));
purchasesRouter.post(
  '/:id/approve',
  approve,
  audited('purchase.approved'),
  asyncHandler(controller.approveRequest),
);
purchasesRouter.post(
  '/:id/reject',
  approve,
  audited('purchase.rejected'),
  asyncHandler(controller.rejectRequest),
);
purchasesRouter.post(
  '/:id/complete',
  audited('purchase.completed'),
  asyncHandler(controller.completeRequest),
);
purchasesRouter.post(
  '/:id/cancel',
  audited('purchase.cancelled'),
  asyncHandler(controller.cancelRequest),
);
