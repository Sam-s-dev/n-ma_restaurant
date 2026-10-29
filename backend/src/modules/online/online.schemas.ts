import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .min(8, 'Numéro de téléphone trop court.')
  .max(30)
  .regex(/^[0-9+\s().-]+$/, 'Numéro de téléphone invalide.');

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM.');

/** Réglages du mini-site, propres au restaurant. */
export const updateOnlineSettingsSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'L’adresse doit faire au moins 3 caractères.')
      .max(40)
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        'Lettres sans accents, chiffres et tirets uniquement (ex. chez-fatou).',
      ),
    enabled: z.boolean(),
    delivery: z.boolean(),
    pickup: z.boolean(),
    opensAt: time.nullable(),
    closesAt: time.nullable(),
    message: z.string().trim().max(300).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Aucun champ à mettre à jour.' })
  .refine((data) => (data.opensAt === undefined) === (data.closesAt === undefined), {
    message: 'Indiquez l’heure d’ouverture et l’heure de fermeture ensemble.',
    path: ['opensAt'],
  });

const zoneFields = {
  name: z.string().trim().min(2, 'Nom de zone trop court.').max(80),
  fee: z.coerce.number().min(0).max(9_999_999),
  isActive: z.boolean(),
};

export const zoneSchema = z.object({ ...zoneFields, isActive: zoneFields.isActive.default(true) });

// Sans valeur par défaut : Zod 4 réactiverait une zone qu'on renomme.
export const updateZoneSchema = z.object(zoneFields).partial();

export const slugParam = z.object({
  slug: z.string().trim().toLowerCase().min(3).max(40),
});

/** Commande passée par un client sur le mini-site. */
export const placeOrderSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Indiquez votre nom.').max(120),
    customerPhone: phone,
    mode: z.enum(['delivery', 'pickup']),
    zoneId: z.string().uuid().nullable().optional(),
    landmark: z.string().trim().max(300).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    paymentMethod: z.enum(['cash', 'mobile_money']),
    items: z
      .array(
        z.object({
          dishId: z.string().uuid(),
          quantity: z.coerce.number().int().min(1).max(99),
        }),
      )
      .min(1, 'Votre panier est vide.')
      .max(50),
  })
  .refine((data) => data.mode === 'pickup' || Boolean(data.zoneId), {
    message: 'Choisissez votre quartier de livraison.',
    path: ['zoneId'],
  })
  .refine((data) => data.mode === 'pickup' || (data.landmark?.length ?? 0) >= 3, {
    message: 'Indiquez un point de repère pour que le livreur vous trouve.',
    path: ['landmark'],
  });

export const trackingParam = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{10,20}$/, 'Code de suivi invalide.'),
});

export type UpdateOnlineSettingsInput = z.infer<typeof updateOnlineSettingsSchema>;
export type ZoneInput = z.infer<typeof zoneSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
