import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';
import { STOCK_UNITS } from '../stock/stock.schemas';

export const PURCHASE_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'completed',
  'cancelled',
] as const;

const amount = z.coerce.number().positive().max(9_999_999_999);

/**
 * Demande d'achat : un produit déjà suivi en stock, ou un nouveau produit
 * désigné par son nom et son unité, créé seulement au moment de l'achat.
 */
export const createPurchaseRequestSchema = z
  .object({
    stockItemId: z.string().uuid().optional(),
    itemName: z.string().trim().min(1).max(120).optional(),
    unit: z.enum(STOCK_UNITS).optional(),
    quantity: z.coerce.number().positive().max(9_999_999),
    estimatedAmount: amount,
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => Boolean(data.stockItemId) || Boolean(data.itemName && data.unit), {
    message: 'Choisissez un produit du stock, ou donnez le nom et l’unité du nouveau produit.',
    path: ['stockItemId'],
  });

export const approvePurchaseSchema = z.object({
  /** Plafond accordé ; à défaut, le montant estimé par le demandeur. */
  approvedAmount: amount.optional(),
  note: z.string().trim().max(500).optional(),
});

export const rejectPurchaseSchema = z.object({
  note: z.string().trim().min(3, 'Expliquez le refus en quelques mots.').max(500),
});

export const completePurchaseSchema = z.object({
  /** Montant réellement payé, au plus le montant approuvé. */
  amount,
  /** Quantité réellement reçue ; à défaut, celle demandée. */
  quantity: z.coerce.number().positive().max(9_999_999).optional(),
  paymentMethod: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer']).default('cash'),
  note: z.string().trim().max(500).optional(),
});

export const cancelPurchaseSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const listPurchasesSchema = paginationSchema.extend({
  status: z.enum(PURCHASE_STATUSES).optional(),
});

export type CreatePurchaseRequestInput = z.infer<typeof createPurchaseRequestSchema>;
export type ApprovePurchaseInput = z.infer<typeof approvePurchaseSchema>;
export type CompletePurchaseInput = z.infer<typeof completePurchaseSchema>;
export type ListPurchasesInput = z.infer<typeof listPurchasesSchema>;
