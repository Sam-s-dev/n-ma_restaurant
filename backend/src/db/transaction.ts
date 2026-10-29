import type { PoolClient, QueryResultRow } from 'pg';
import { pool } from './pool';

/**
 * Contexte transactionnel passé aux services métier.
 *
 * Toutes les opérations qui touchent plusieurs modules (une vente qui
 * alimente la caisse, une dépense qui débite la caisse et augmente le stock)
 * doivent passer par `withTransaction` : soit tout est écrit, soit rien.
 */
export interface Tx {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T | null>;
  /**
   * À lancer une fois la transaction validée — un message envoyé sur un
   * téléphone ne se rattrape pas si tout est finalement annulé. Hors
   * transaction, l'action part tout de suite.
   */
  afterCommit?(action: () => void): void;
}

function wrap(client: PoolClient, pending: Array<() => void>): Tx {
  return {
    afterCommit(action) {
      pending.push(action);
    },
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
      const result = await client.query<T>(text, params as never[]);
      return result.rows;
    },
    async queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
      const result = await client.query<T>(text, params as never[]);
      return result.rows[0] ?? null;
    },
  };
}

export async function withTransaction<T>(handler: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const pending: Array<() => void> = [];
  try {
    await client.query('BEGIN');
    const result = await handler(wrap(client, pending));
    await client.query('COMMIT');
    for (const action of pending) {
      try {
        action();
      } catch {
        // Une action annexe (envoi d'un message) ne remet pas en cause ce
        // qui vient d'être enregistré.
      }
    }
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
