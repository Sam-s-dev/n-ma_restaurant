import type { ZodType } from 'zod';
import { badRequest } from './errors';

/**
 * Valide une entrée (body / query / params) et renvoie la valeur typée.
 * En cas d'échec : 400 avec la liste des champs fautifs, exploitable
 * directement par le formulaire côté mobile.
 */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown, label = 'requête'): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '(racine)',
    message: issue.message,
  }));

  throw badRequest(`Données invalides dans la ${label}.`, details);
}
