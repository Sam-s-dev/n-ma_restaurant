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
    /** Identifiant donné par le téléphone : la même vente ne compte qu'une fois. */
    clientId: z.string().uuid().optional(),
  })
  .refine((data) => data.paymentMethod !== 'credit' || Boolean(data.customerId), {
    message: 'Une vente à crédit exige un client enregistré.',
    path: ['customerId'],
  });

/** Ventes faites hors connexion, envoyées au retour du réseau. */
export const syncSalesSchema = z.object({
  sales: z
    .array(
      z.object({
        clientId: z.string().uuid(),
        /** Numéro provisoire imprimé sur le ticket (« HL-0003 »). */
        offlineRef: z.string().trim().max(30),
        soldAt: z.coerce.date(),
        items: z.array(saleItemSchema).min(1),
        paymentMethod: z.enum(PAYMENT_METHODS),
        customerId: z.string().uuid().optional(),
        note: z.string().trim().max(400).optional(),
      }),
    )
    .min(1)
    .max(100),
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
export type SyncSalesInput = z.infer<typeof syncSalesSchema>;
export type ListSalesInput = z.infer<typeof listSalesSchema>;
