import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './expenses.controller';

export const expensesRouter = Router();

// Réservé au gérant : le magasinier passe par une demande d'achat
// (module purchases), que le gérant approuve avant toute sortie d'argent.
expensesRouter.use(requirePermission('expenses.manage'));

expensesRouter.get('/categories', asyncHandler(controller.categories));
expensesRouter.get('/', asyncHandler(controller.listExpenses));
expensesRouter.post('/', audited('expense.created'), asyncHandler(controller.createExpense));
expensesRouter.get('/:id', asyncHandler(controller.getExpense));
expensesRouter.post(
  '/:id/cancel',
  audited('expense.cancelled'),
  asyncHandler(controller.cancelExpense),
);
