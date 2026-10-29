import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './tables.controller';

const serve = requirePermission('tables.serve');
const settle = requirePermission('bills.settle');
const manage = requirePermission('settings.manage');
const cancel = requirePermission('sales.cancel');

/** Plan de salle : le serveur y travaille, le gérant le dessine. */
export const tablesRouter = Router();

tablesRouter.get('/', requirePermission('tables.serve', 'bills.settle'), asyncHandler(controller.listTables));
tablesRouter.post('/', manage, audited('table.created'), asyncHandler(controller.createTable));
tablesRouter.post('/batch', manage, audited('table.created'), asyncHandler(controller.createTablesBatch));
tablesRouter.get('/kitchen-settings', requirePermission('kitchen.handle', 'settings.manage'), asyncHandler(controller.getKitchenSettings));
tablesRouter.patch('/kitchen-settings', manage, audited('kitchen.settings_updated'), asyncHandler(controller.updateKitchenSettings));
tablesRouter.patch('/:id', manage, audited('table.updated'), asyncHandler(controller.updateTable));
tablesRouter.delete('/:id', manage, audited('table.deleted'), asyncHandler(controller.deleteTable));
tablesRouter.post('/:id/bills', serve, audited('bill.opened'), asyncHandler(controller.openBill));

/** Additions : le serveur les remplit, le caissier les encaisse, le gérant annule. */
export const billsRouter = Router();

billsRouter.get('/', requirePermission('tables.serve', 'bills.settle'), asyncHandler(controller.listBills));
billsRouter.get('/:id', requirePermission('tables.serve', 'bills.settle'), asyncHandler(controller.getBill));
billsRouter.post('/:id/send', serve, asyncHandler(controller.sendItems));
billsRouter.post('/:id/request', serve, asyncHandler(controller.requestBill));
billsRouter.post('/:id/pay', settle, audited('bill.paid'), asyncHandler(controller.payBill));
billsRouter.post('/:id/cancel', cancel, audited('bill.cancelled'), asyncHandler(controller.cancelBill));
billsRouter.post('/items/:id/served', serve, asyncHandler(controller.markServed));
billsRouter.post('/items/:id/cancel', cancel, audited('bill.item_cancelled'), asyncHandler(controller.cancelItem));
