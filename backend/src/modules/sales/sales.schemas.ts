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

    /**
     * §8 — Vente à crédit : le client doit être une fiche déjà enregistrée.
     *
     * Autoriser un simple nom libre créait un client par vente : « Mariama »,
     * « mariama », « Mariama D. » finissaient en trois dettes séparées, et
     * plus personne ne savait qui devait combien le jour du remboursement.
     */
    customerId: z.string().uuid('Choisissez un client enregistré.').optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((data) => data.paymentMethod !== 'credit' || Boolean(data.customerId), {
    message: 'Une vente à crédit exige un client enregistré.',
    path: ['customerId'],
  });

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
