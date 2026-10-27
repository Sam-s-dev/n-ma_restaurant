import { z } from 'zod';
import { ROLES } from '../../core/permissions';

const roleSchema = z.enum(ROLES, { message: 'Rôle inconnu.' });

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  role: roleSchema.default('cashier'),
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
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

/**
 * Tout compte est aussi un employé. Soit on donne un accès à un employé
 * déjà enregistré (`employeeId`), soit on crée sa fiche dans la foulée
 * (`employee`) : poste, salaire et date d'embauche.
 */
export const createMemberSchema = z
  .object({
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
  /** Choisi explicitement : aucun rôle par défaut ne donnerait trop ou trop peu. */
  role: roleSchema,
  employeeId: z.string().uuid('Employé invalide.').optional(),
  employee: z
    .object({
      position: z.string().trim().min(2, 'Indiquez le poste.').max(80),
      monthlySalary: z.coerce.number().min(0).max(9_999_999_999).default(0),
      hireDate: isoDate,
    })
    .optional(),
  })
  .refine((data) => Boolean(data.employeeId) !== Boolean(data.employee), {
    message: 'Choisissez un employé existant, ou renseignez sa fiche (poste, salaire, embauche).',
    path: ['employeeId'],
  });

export const updateMemberSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(4).max(30).nullable(),
    isActive: z.boolean(),
    role: roleSchema,
    /** Rattache à une fiche employé un compte créé avant le lien obligatoire. */
    employeeId: z.string().uuid('Employé invalide.'),
  })
  .partial();

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
