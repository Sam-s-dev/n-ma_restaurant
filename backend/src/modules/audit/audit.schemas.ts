import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../core/pagination';

export const listAuditSchema = paginationSchema.merge(dateRangeSchema).extend({
  userId: z.string().uuid().optional(),
  action: z
    .string()
    .regex(/^[a-z_]+(\.[a-z_]+)?$/, 'Action invalide.')
    .optional(),
});

export type ListAuditInput = z.infer<typeof listAuditSchema>;
