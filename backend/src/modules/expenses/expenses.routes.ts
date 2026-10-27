import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './expenses.controller';

export const expensesRouter = Router();

// Le magasinier n'enregistre que des achats de stock : le contrôleur
// vérifie la catégorie et filtre la liste en conséquence.
expensesRouter.use(requirePermission('expenses.manage', 'expenses.stock_purchase'));

expensesRouter.get('/categories', asyncHandler(controller.categories));
expensesRouter.get('/', asyncHandler(controller.listExpenses));
expensesRouter.post('/', audited('expense.created'), asyncHandler(controller.createExpense));
expensesRouter.get('/:id', asyncHandler(controller.getExpense));
expensesRouter.post(
  '/:id/cancel',
  requirePermission('expenses.manage'),
  audited('expense.cancelled'),
  asyncHandler(controller.cancelExpense),
);
