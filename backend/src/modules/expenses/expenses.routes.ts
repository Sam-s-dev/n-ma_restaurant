import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './expenses.controller';

export const expensesRouter = Router();

expensesRouter.get('/categories', asyncHandler(controller.categories));
expensesRouter.get('/', asyncHandler(controller.listExpenses));
expensesRouter.post('/', asyncHandler(controller.createExpense));
expensesRouter.get('/:id', asyncHandler(controller.getExpense));
expensesRouter.post('/:id/cancel', asyncHandler(controller.cancelExpense));
