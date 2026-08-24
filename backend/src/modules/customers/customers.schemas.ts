import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .min(4)
  .max(30)
  .regex(/^[0-9+\s().-]+$/, 'Numéro de téléphone invalide.');

export const createCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phone.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const listCustomersSchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  onlyDebtors: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;
