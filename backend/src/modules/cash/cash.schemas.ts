import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../core/pagination';

export const listMovementsSchema = paginationSchema.merge(dateRangeSchema).extend({
  direction: z.enum(['in', 'out']).optional(),
  category: z.enum(['sale', 'credit_payment', 'expense', 'salary', 'adjustment']).optional(),
});

/** Correction manuelle du solde (erreur de saisie, fonds de caisse initial). */
export const adjustCashSchema = z.object({
  direction: z.enum(['in', 'out']),
  amount: z.coerce.number().positive().max(9_999_999_999),
  label: z.string().trim().min(3).max(255),
  occurredAt: z.coerce.date().optional(),
});

export type ListMovementsInput = z.infer<typeof listMovementsSchema>;
export type AdjustCashInput = z.infer<typeof adjustCashSchema>;
