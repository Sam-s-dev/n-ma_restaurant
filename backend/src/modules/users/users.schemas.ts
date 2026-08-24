import { z } from 'zod';

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export const updateMemberSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(4).max(30).nullable(),
    isActive: z.boolean(),
  })
  .partial();

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
