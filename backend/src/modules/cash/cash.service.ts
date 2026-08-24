import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2 } from '../../utils/money';
import type { AdjustCashInput, ListMovementsInput } from './cash.schemas';

export type CashCategory = 'sale' | 'credit_payment' | 'expense' | 'salary' | 'adjustment';
export type CashSource = 'sale' | 'credit_payment' | 'expense' | 'salary_payment' | 'manual';
export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'bank_transfer';

export interface RecordMovementParams {
  restaurantId: string;
  direction: 'in' | 'out';
  amount: number;
  category: CashCategory;
  label: string;
  sourceType?: CashSource;
  sourceId?: string;
  paymentMethod?: PaymentMethod;
  occurredAt?: Date;
  createdBy?: string | null;
}

/**
 * Écrit une ligne dans le grand livre de caisse. À appeler **uniquement**
 * depuis une transaction, pour que le mouvement et son document source
 * (vente, dépense, remboursement) soient validés ensemble (§7, §10).
 * Le solde est recalculé par un trigger PostgreSQL.
 */
export async function recordMovement(tx: Tx, params: RecordMovementParams): Promise<string> {
  const row = await tx.queryOne<{ id: string }>(
    `INSERT INTO cash_movements
       (restaurant_id, direction, amount, category, source_type, source_id,
        payment_method, label, occurred_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10)
     RETURNING id`,
    [
      params.restaurantId,
      params.direction,
      round2(params.amount),
      params.category,
      params.sourceType ?? null,
      params.sourceId ?? null,
      params.paymentMethod ?? null,
      params.label,
      params.occurredAt ?? null,
      params.createdBy ?? null,
    ],
  );
  if (!row) throw new Error('Écriture du mouvement de caisse impossible.');
  return row.id;
}

/**
 * Contre-passe les mouvements liés à un document annulé : on n'efface jamais
 * une écriture du grand livre, on en ajoute une inverse.
 */
export async function reverseMovements(
  tx: Tx,
  params: {
    restaurantId: string;
    sourceType: CashSource;
    sourceId: string;
    label: string;
    createdBy?: string | null;
  },
): Promise<number> {
  const originals = await tx.query<{
    direction: 'in' | 'out';
    amount: number;
    category: CashCategory;
    payment_method: PaymentMethod | null;
  }>(
    `SELECT direction, amount, category, payment_method
       FROM cash_movements
      WHERE restaurant_id = $1 AND source_type = $2 AND source_id = $3`,
    [params.restaurantId, params.sourceType, params.sourceId],
  );

  for (const original of originals) {
    await recordMovement(tx, {
      restaurantId: params.restaurantId,
      direction: original.direction === 'in' ? 'out' : 'in',
      amount: original.amount,
      category: original.category,
      label: params.label,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      ...(original.payment_method ? { paymentMethod: original.payment_method } : {}),
      createdBy: params.createdBy ?? null,
    });
  }

  return originals.length;
}

export interface CashBalance {
  balance: number;
  totalIn: number;
  totalOut: number;
  updatedAt: string | null;
}

/** §7 — solde actuel disponible, affiché en permanence dans l'application. */
export async function getBalance(restaurantId: string): Promise<CashBalance> {
  const row = await queryOne<{
    balance: number;
    total_in: number;
    total_out: number;
    updated_at: Date;
  }>(
    'SELECT balance, total_in, total_out, updated_at FROM cash_balances WHERE restaurant_id = $1',
    [restaurantId],
  );

  if (!row) return { balance: 0, totalIn: 0, totalOut: 0, updatedAt: null };
  return {
    balance: row.balance,
    totalIn: row.total_in,
    totalOut: row.total_out,
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface CashMovement {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  category: CashCategory;
  sourceType: CashSource | null;
  sourceId: string | null;
  paymentMethod: PaymentMethod | null;
  label: string;
  occurredAt: string;
  createdByName: string | null;
}

interface MovementRow {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  category: CashCategory;
  source_type: CashSource | null;
  source_id: string | null;
  payment_method: PaymentMethod | null;
  label: string;
  occurred_at: Date;
  created_by_name: string | null;
}

const toMovement = (row: MovementRow): CashMovement => ({
  id: row.id,
  direction: row.direction,
  amount: row.amount,
  category: row.category,
  sourceType: row.source_type,
  sourceId: row.source_id,
  paymentMethod: row.payment_method,
  label: row.label,
  occurredAt: row.occurred_at.toISOString(),
  createdByName: row.created_by_name,
});

/** §7 — historique complet et consultable de tous les mouvements. */
export async function listMovements(
  restaurantId: string,
  input: ListMovementsInput,
): Promise<Paginated<CashMovement> & { totals: { in: number; out: number; net: number } }> {
  const conditions = ['m.restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (input.direction) {
    params.push(input.direction);
    conditions.push(`m.direction = $${params.length}`);
  }
  if (input.category) {
    params.push(input.category);
    conditions.push(`m.category = $${params.length}`);
  }
  if (input.from) {
    params.push(input.from);
    conditions.push(`m.occurred_at >= $${params.length}::date`);
  }
  if (input.to) {
    params.push(input.to);
    conditions.push(`m.occurred_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const summary = await queryOne<{ count: number; total_in: number; total_out: number }>(
    `SELECT count(*)::int AS count,
            COALESCE(sum(m.amount) FILTER (WHERE m.direction = 'in'), 0)  AS total_in,
            COALESCE(sum(m.amount) FILTER (WHERE m.direction = 'out'), 0) AS total_out
       FROM cash_movements m ${where}`,
    params,
  );

  params.push(input.limit, offsetOf(input));
  const rows = await query<MovementRow>(
    `SELECT m.id, m.direction, m.amount, m.category, m.source_type, m.source_id,
            m.payment_method, m.label, m.occurred_at,
            u.full_name AS created_by_name
       FROM cash_movements m
       LEFT JOIN users u ON u.id = m.created_by
       ${where}
      ORDER BY m.occurred_at DESC, m.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const totalIn = summary?.total_in ?? 0;
  const totalOut = summary?.total_out ?? 0;

  return {
    ...paginate(rows.map(toMovement), summary?.count ?? 0, input),
    totals: { in: totalIn, out: totalOut, net: round2(totalIn - totalOut) },
  };
}

export async function adjust(
  restaurantId: string,
  userId: string,
  input: AdjustCashInput,
): Promise<CashBalance> {
  await withTransaction(async (tx) => {
    await recordMovement(tx, {
      restaurantId,
      direction: input.direction,
      amount: input.amount,
      category: 'adjustment',
      label: input.label,
      sourceType: 'manual',
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      createdBy: userId,
    });
  });
  return getBalance(restaurantId);
}

/** Répartition par mode de paiement, utile pour le contrôle de fin de journée. */
export async function paymentBreakdown(
  restaurantId: string,
  from?: string,
  to?: string,
): Promise<Array<{ paymentMethod: string; total: number; count: number }>> {
  const conditions = ["m.restaurant_id = $1", "m.direction = 'in'"];
  const params: unknown[] = [restaurantId];

  if (from) {
    params.push(from);
    conditions.push(`m.occurred_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`m.occurred_at < ($${params.length}::date + interval '1 day')`);
  }

  return query(
    `SELECT COALESCE(m.payment_method, 'inconnu') AS "paymentMethod",
            sum(m.amount) AS total,
            count(*)::int AS count
       FROM cash_movements m
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY total DESC`,
    params,
  );
}
