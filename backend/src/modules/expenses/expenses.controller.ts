import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
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
  res.json(await service.listExpenses(user.restaurantId, input));
}

export async function getExpense(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getExpense(user.restaurantId, id));
}

export async function createExpense(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createExpenseSchema, req.body, 'dépense');
  res.status(201).json(await service.createExpense(user.restaurantId, user.id, input));
}

export async function cancelExpense(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(cancelExpenseSchema, req.body, 'requête');
  res.json(await service.cancelExpense(user.restaurantId, id, user.id, input.reason));
}

export async function categories(_req: Request, res: Response) {
  res.json({ items: EXPENSE_CATEGORIES });
}
