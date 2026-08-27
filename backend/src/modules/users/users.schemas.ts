import { z } from 'zod';

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

/**
 * §2.b — Création directe d'un compte pour un collègue.
 *
 * Le gérant saisit lui-même l'adresse et le mot de passe, puis les
 * communique de vive voix. Le détour par un code d'invitation à transmettre
 * supposait que le collègue ait un téléphone, sache ouvrir un lien et
 * termine la démarche : trois occasions d'échouer pour un serveur qu'on
 * inscrit en deux minutes derrière le comptoir.
 */
export const createMemberSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom trop court.').max(120),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
    .max(128),
  phone: z
    .string()
    .trim()
    .min(4)
    .max(30)
    .regex(/^[0-9+\s().-]+$/, 'Numéro de téléphone invalide.')
    .nullable()
    .optional(),
});

export const updateMemberSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(4).max(30).nullable(),
    isActive: z.boolean(),
  })
  .partial();

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
