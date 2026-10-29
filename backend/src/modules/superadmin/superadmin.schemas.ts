import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';

export const superAdminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const listRestaurantsSchema = paginationSchema.extend({
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const activateSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

export const onlineSchema = z.object({ allowed: z.boolean() });

export const disableSchema = z.object({
  reason: z.string().trim().min(3).max(255),
});

export const superAdminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
});

export type ListRestaurantsInput = z.infer<typeof listRestaurantsSchema>;
