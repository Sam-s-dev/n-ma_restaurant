import { z } from 'zod';

export const STOCK_UNITS = [
  'kg',
  'g',
  'l',
  'ml',
  'piece',
  'sachet',
  'carton',
  'bouteille',
  'casier',
  'sac',
] as const;

export const createStockItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.enum(STOCK_UNITS),
  quantity: z.coerce.number().min(0).max(9_999_999).default(0),
  purchasePrice: z.coerce.number().min(0).max(9_999_999_999).default(0),
  alertThreshold: z.coerce.number().min(0).max(9_999_999).default(0),
});

export const updateStockItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    unit: z.enum(STOCK_UNITS),
    purchasePrice: z.coerce.number().min(0).max(9_999_999_999),
    alertThreshold: z.coerce.number().min(0).max(9_999_999),
  })
  .partial();

/**
 * Correction d'inventaire ou perte. L'ajout par achat passe par le module
 * Dépenses (§6, §9) pour que la caisse soit débitée en même temps.
 */
export const adjustStockSchema = z.object({
  direction: z.enum(['in', 'out']),
  quantity: z.coerce.number().positive().max(9_999_999),
  reason: z.enum(['adjustment', 'loss']).default('adjustment'),
  note: z.string().trim().max(255).optional(),
});

export const listStockSchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  onlyLow: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
});

export type CreateStockItemInput = z.infer<typeof createStockItemSchema>;
export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ListStockInput = z.infer<typeof listStockSchema>;
