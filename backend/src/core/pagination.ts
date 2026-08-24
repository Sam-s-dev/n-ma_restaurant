import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function offsetOf(pagination: Pagination): number {
  return (pagination.page - 1) * pagination.limit;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function paginate<T>(items: T[], total: number, p: Pagination): Paginated<T> {
  return {
    items,
    page: p.page,
    limit: p.limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / p.limit),
  };
}

/** Filtre de période commun aux modules caisse / ventes / dépenses. */
export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
