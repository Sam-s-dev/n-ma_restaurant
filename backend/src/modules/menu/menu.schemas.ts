import { z } from 'zod';

const categoryFields = {
  name: z.string().trim().min(1).max(80),
  position: z.coerce.number().int().min(0).max(999),
};

export const createCategorySchema = z.object({
  ...categoryFields,
  position: categoryFields.position.default(0),
});

export const updateCategorySchema = z.object(categoryFields).partial();

const dishFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  photoMediaId: z.string().uuid().nullable().optional(),
  price: z.coerce.number().min(0).max(9_999_999_999),
  isAvailable: z.boolean(),
  /** Proposé sur le mini-site de commande en ligne. */
  isOnline: z.boolean(),
  /**
   * §5 — Portions préparées. `null` laisse le plat vendable sans limite
   * (préparé à la commande) ; un nombre le fait décompter à chaque vente.
   */
  availableQuantity: z.coerce.number().int().min(0).max(99_999).nullable().optional(),
};

export const createDishSchema = z.object({
  ...dishFields,
  isAvailable: dishFields.isAvailable.default(true),
  isOnline: dishFields.isOnline.default(true),
});

/**
 * Sans valeurs par défaut : Zod 4 les appliquerait aux champs absents, et
 * renommer un plat le remettrait « disponible » et en ligne.
 */
export const updateDishSchema = z.object(dishFields).partial();

/** §5 — bascule rapide « disponible / en rupture » depuis la liste du menu. */
export const setAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const listDishesSchema = z.object({
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  onlyAvailable: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateDishInput = z.infer<typeof createDishSchema>;
export type UpdateDishInput = z.infer<typeof updateDishSchema>;
export type ListDishesInput = z.infer<typeof listDishesSchema>;
