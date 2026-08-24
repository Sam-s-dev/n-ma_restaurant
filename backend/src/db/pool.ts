import { Pool, types } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * pg renvoie NUMERIC et BIGINT sous forme de chaînes pour préserver la
 * précision. Les montants manipulés ici (caisse de restaurant, 2 décimales)
 * tiennent très largement dans un Number JS, on les convertit donc une fois
 * pour toutes afin que le JSON envoyé au mobile contienne de vrais nombres.
 */
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value));
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
// DATE : on veut 'YYYY-MM-DD' brut, pas un Date décalé par le fuseau serveur.
types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: env.databaseSsl === 'require' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Erreur inattendue sur un client PostgreSQL inactif');
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const started = Date.now();
  const result = await pool.query<T>(text, params as never[]);
  logger.debug({ sql: text.slice(0, 120), ms: Date.now() - started }, 'requête sql');
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export type Db = Pick<PoolClient, 'query'>;

export async function closePool(): Promise<void> {
  await pool.end();
}
