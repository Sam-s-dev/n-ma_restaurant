import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './customers.controller';

export const customersRouter = Router();

customersRouter.use(requirePermission('customers.manage'));

customersRouter.get('/', asyncHandler(controller.listCustomers));
customersRouter.post('/', asyncHandler(controller.createCustomer));
customersRouter.get('/:id', asyncHandler(controller.getCustomer));
customersRouter.patch('/:id', asyncHandler(controller.updateCustomer));
customersRouter.delete(
  '/:id',
  requirePermission('customers.delete'),
  audited('customer.deleted'),
  asyncHandler(controller.deleteCustomer),
);
