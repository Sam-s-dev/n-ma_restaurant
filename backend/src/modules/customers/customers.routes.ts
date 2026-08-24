import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './customers.controller';

export const customersRouter = Router();

customersRouter.get('/', asyncHandler(controller.listCustomers));
customersRouter.post('/', asyncHandler(controller.createCustomer));
customersRouter.get('/:id', asyncHandler(controller.getCustomer));
customersRouter.patch('/:id', asyncHandler(controller.updateCustomer));
customersRouter.delete('/:id', asyncHandler(controller.deleteCustomer));
