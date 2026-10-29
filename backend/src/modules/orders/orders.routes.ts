import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './orders.controller';

/** Commandes en ligne, côté restaurant : accepter, préparer, livrer, encaisser. */
export const ordersRouter = Router();

ordersRouter.use(requirePermission('orders.manage'));

ordersRouter.get('/', asyncHandler(controller.listOrders));
ordersRouter.get('/drivers', asyncHandler(controller.listDrivers));
ordersRouter.get('/:id', asyncHandler(controller.getOrder));
ordersRouter.post('/:id/accept', audited('order.accepted'), asyncHandler(controller.acceptOrder));
ordersRouter.post('/:id/reject', audited('order.rejected'), asyncHandler(controller.rejectOrder));
ordersRouter.post('/:id/ready', asyncHandler(controller.markReady));
ordersRouter.post('/:id/assign', audited('order.assigned'), asyncHandler(controller.assignDriver));
ordersRouter.post('/:id/cancel', audited('order.cancelled'), asyncHandler(controller.cancelOrder));
ordersRouter.post('/:id/complete', audited('order.completed'), asyncHandler(controller.completeOrder));

/** Le livreur ne voit que ses courses : le service vérifie qu'elles sont à lui. */
export const deliveriesRouter = Router();

deliveriesRouter.use(requirePermission('deliveries.handle'));

deliveriesRouter.get('/', asyncHandler(controller.myDeliveries));
deliveriesRouter.post('/:id/dispatch', asyncHandler(controller.dispatchOrder));
deliveriesRouter.post('/:id/deliver', audited('delivery.delivered'), asyncHandler(controller.deliverOrder));
deliveriesRouter.post('/:id/issue', audited('delivery.issue'), asyncHandler(controller.reportIssue));
