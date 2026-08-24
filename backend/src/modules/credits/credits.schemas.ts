import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';

export const listCreditsSchema = paginationSchema.extend({
  status: z.enum(['open', 'partially_paid', 'paid', 'cancelled']).optional(),
  customerId: z.string().uuid().optional(),
  /** Par défaut on n'affiche que les créances en cours (§8). */
  onlyOpen: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(true),
});

export const repayCreditSchema = z.object({
  amount: z.coerce.number().positive().max(9_999_999_999),
  paymentMethod: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer']).default('cash'),
  note: z.string().trim().max(255).optional(),
  paidAt: z.coerce.date().optional(),
});

export type ListCreditsInput = z.infer<typeof listCreditsSchema>;
export type RepayCreditInput = z.infer<typeof repayCreditSchema>;
