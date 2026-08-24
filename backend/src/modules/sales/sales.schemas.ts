import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../core/pagination';

export const PAYMENT_METHODS = ['cash', 'mobile_money', 'card', 'credit'] as const;

const saleItemSchema = z.object({
  dishId: z.string().uuid('Plat invalide.'),
  quantity: z.coerce.number().positive().max(9999),
  /** Prix libre autorisé (remise ponctuelle) ; à défaut, prix du menu. */
  unitPrice: z.coerce.number().min(0).max(9_999_999_999).optional(),
});

export const createSaleSchema = z
  .object({
    items: z.array(saleItemSchema).min(1, 'Ajoutez au moins un plat à la vente.'),
    paymentMethod: z.enum(PAYMENT_METHODS),
    note: z.string().trim().max(500).optional(),
    soldAt: z.coerce.date().optional(),

    // §8 — vente à crédit : le client est obligatoire.
    customerId: z.string().uuid().optional(),
    customerName: z.string().trim().min(2).max(120).optional(),
    customerPhone: z
      .string()
      .trim()
      .min(4)
      .max(30)
      .regex(/^[0-9+\s().-]+$/, 'Numéro de téléphone invalide.')
      .optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (data) =>
      data.paymentMethod !== 'credit' || Boolean(data.customerId || data.customerName),
    {
      message: 'Une vente à crédit exige un client (existant ou nouveau).',
      path: ['customerName'],
    },
  );

export const listSalesSchema = paginationSchema.merge(dateRangeSchema).extend({
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(['paid', 'credit', 'cancelled']).optional(),
  customerId: z.string().uuid().optional(),
});

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3).max(255),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ListSalesInput = z.infer<typeof listSalesSchema>;
