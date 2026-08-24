import { badRequest } from './errors';

/**
 * Construit la partie SET d'un UPDATE à partir d'un objet partiel validé.
 *
 * Les noms de colonnes proviennent exclusivement de la table de
 * correspondance fournie par le module appelant (jamais des clés reçues du
 * client) et les valeurs sont toujours passées en paramètres liés : aucune
 * concaténation de données utilisateur dans le SQL.
 */
export function buildUpdate<T extends object>(
  input: T,
  columns: Partial<Record<keyof T, string>>,
  startIndex = 1,
): { setClause: string; values: unknown[]; nextIndex: number } {
  const fragments: string[] = [];
  const values: unknown[] = [];
  let index = startIndex;

  for (const [key, column] of Object.entries(columns) as Array<[keyof T, string]>) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === undefined) continue;

    fragments.push(`${column} = $${index}`);
    values.push(value);
    index += 1;
  }

  if (fragments.length === 0) throw badRequest('Aucun champ à mettre à jour.');

  return { setClause: fragments.join(', '), values, nextIndex: index };
}
