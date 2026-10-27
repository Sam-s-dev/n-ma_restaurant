import type { Request, Response } from 'express';
import { z } from 'zod';
import { forbidden, notFound } from '../../core/errors';
import { parseOrThrow } from '../../core/validate';
import { can, currentUser } from '../../middlewares/auth';
import * as service from './expenses.service';
import {
  cancelExpenseSchema,
  createExpenseSchema,
  listExpensesSchema,
  EXPENSE_CATEGORIES,
} from './expenses.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant de dépense invalide.') });

export async function listExpenses(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listExpensesSchema, req.query, 'requête');
  // Le magasinier ne voit que les achats de marchandise, pas les factures
  // ni les salaires.
  if (!can(req, 'expenses.manage')) input.category = 'stock_purchase';
  res.json(await service.listExpenses(user.restaurantId, input));
}

export async function getExpense(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const expense = await service.getExpense(user.restaurantId, id);
  if (!can(req, 'expenses.manage') && expense.category !== 'stock_purchase') {
    throw notFound('Dépense');
  }
  res.json(expense);
}

export async function createExpense(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createExpenseSchema, req.body, 'dépense');
  if (!can(req, 'expenses.manage') && input.category !== 'stock_purchase') {
    throw forbidden('Votre rôle permet seulement d’enregistrer des achats de stock.');
  }
  res.status(201).json(await service.createExpense(user.restaurantId, user.id, input));
}

export async function cancelExpense(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(cancelExpenseSchema, req.body, 'requête');
  res.json(await service.cancelExpense(user.restaurantId, id, user.id, input.reason));
}

export async function categories(req: Request, res: Response) {
  res.json({
    items: can(req, 'expenses.manage') ? EXPENSE_CATEGORIES : ['stock_purchase'],
  });
}
