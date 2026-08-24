import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../core/pagination';

export const EXPENSE_CATEGORIES = [
  'stock_purchase',
  'salary',
  'bill',
  'maintenance',
  'other',
] as const;

export const createExpenseSchema = z
  .object({
    amount: z.coerce.number().positive().max(9_999_999_999),
    category: z.enum(EXPENSE_CATEGORIES),
    description: z.string().trim().min(1).max(500),
    expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    paymentMethod: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer']).default('cash'),

    // §9 — obligatoires si la dépense est un achat de stock.
    stockItemId: z.string().uuid().optional(),
    quantity: z.coerce.number().positive().max(9_999_999).optional(),
  })
  .refine(
    (data) =>
      data.category !== 'stock_purchase' || (Boolean(data.stockItemId) && data.quantity !== undefined),
    {
      message: 'Un achat de stock exige le produit concerné et la quantité achetée.',
      path: ['stockItemId'],
    },
  )
  .refine((data) => data.category === 'stock_purchase' || !data.stockItemId, {
    message: 'Le produit ne se renseigne que pour un achat de stock.',
    path: ['stockItemId'],
  })
  .refine((data) => data.category !== 'salary', {
    message:
      'Un salaire s’enregistre depuis la fiche employé (module Personnel), pas ici.',
    path: ['category'],
  });

export const listExpensesSchema = paginationSchema.merge(dateRangeSchema).extend({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  stockItemId: z.string().uuid().optional(),
  includeCancelled: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
});

export const cancelExpenseSchema = z.object({
  reason: z.string().trim().min(3).max(255),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesSchema>;
