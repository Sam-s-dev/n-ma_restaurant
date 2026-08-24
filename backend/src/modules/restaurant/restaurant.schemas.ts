import { z } from 'zod';

/** §3 — Paramètres du restaurant, réutilisés sur les tickets de vente. */
export const updateRestaurantSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(255).nullable(),
    phone: z
      .string()
      .trim()
      .min(4)
      .max(30)
      .regex(/^[0-9+\s().-]+$/, 'Numéro de téléphone invalide.')
      .nullable(),
    logoMediaId: z.string().uuid().nullable(),
    currencyCode: z.string().trim().length(3).toUpperCase(),
    currencySymbol: z.string().trim().min(1).max(8),
    // 0 pour le franc guinéen (pas de centimes), 2 pour l'euro ou le dollar.
    currencyDecimals: z.coerce.number().int().min(0).max(3),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Aucun champ à mettre à jour.',
  });

export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
