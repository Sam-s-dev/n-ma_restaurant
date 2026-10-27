import { z } from 'zod';
import { paginationSchema } from '../../core/pagination';

const amount = z.coerce.number().min(0).max(9_999_999_999);

/** Comptage par billet ou pièce : { "20000": 3, "500": 4 }. */
const breakdownSchema = z
  .record(
    z.string().regex(/^\d{1,6}$/, 'Valeur de billet invalide.'),
    z.coerce.number().int().min(0).max(100_000),
  )
  .optional();

export const openSessionSchema = z.object({
  openingFloat: amount,
  breakdown: breakdownSchema,
});

export const closeSessionSchema = z.object({
  countedCash: amount,
  breakdown: breakdownSchema,
  /** Total du relevé Mobile Money de l'opérateur, s'il a été consulté. */
  countedMobileMoney: amount.optional(),
  note: z.string().trim().max(500).optional(),
});

export const listSessionsSchema = paginationSchema;

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
