import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(128);

const email = z.string().trim().toLowerCase().email('Adresse e-mail invalide.');

const phone = z
  .string()
  .trim()
  .min(4)
  .max(30)
  .regex(/^[0-9+\s().-]+$/, 'Numéro de téléphone invalide.');

/** §2.b — le premier utilisateur crée l'espace restaurant. */
export const registerSchema = z.object({
  restaurantName: z.string().trim().min(2).max(120),
  address: z.string().trim().max(255).optional(),
  restaurantPhone: phone.optional(),
  // Franc guinéen par défaut : sans centimes, d'où `currencyDecimals` à 0.
  currencyCode: z.string().trim().length(3).toUpperCase().default('GNF'),
  currencySymbol: z.string().trim().min(1).max(8).default('FG'),
  currencyDecimals: z.coerce.number().int().min(0).max(3).default(0),

  fullName: z.string().trim().min(2).max(120),
  email,
  password,
  phone: phone.optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Mot de passe requis.'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20),
  fullName: z.string().trim().min(2).max(120),
  password,
  phone: phone.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
