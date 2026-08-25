import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../core/pagination';

export const listMovementsSchema = paginationSchema.merge(dateRangeSchema).extend({
  direction: z.enum(['in', 'out']).optional(),
  category: z
    .enum(['sale', 'credit_payment', 'expense', 'salary', 'adjustment', 'capital'])
    .optional(),
});

/** Correction manuelle du solde, après une erreur de saisie. */
export const adjustCashSchema = z.object({
  direction: z.enum(['in', 'out']),
  amount: z.coerce.number().positive().max(9_999_999_999),
  label: z.string().trim().min(3).max(255),
  occurredAt: z.coerce.date().optional(),
});

/**
 * Apport (ou retrait) de capital du gérant. Le libellé est facultatif :
 * l'opération se suffit à elle-même, contrairement à une correction dont
 * la raison doit rester lisible dans le grand livre.
 */
export const contributeCashSchema = z.object({
  direction: z.enum(['in', 'out']).default('in'),
  amount: z.coerce.number().positive().max(9_999_999_999),
  label: z.string().trim().min(3).max(255).default('Apport du gérant'),
  paymentMethod: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer']).default('cash'),
  occurredAt: z.coerce.date().optional(),
});

export type ListMovementsInput = z.infer<typeof listMovementsSchema>;
export type AdjustCashInput = z.infer<typeof adjustCashSchema>;
export type ContributeCashInput = z.infer<typeof contributeCashSchema>;
