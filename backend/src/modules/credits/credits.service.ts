import { conflict, notFound, unprocessable } from '../../core/errors';
import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { round2 } from '../../utils/money';
import { recordMovement } from '../cash/cash.service';
import type { ListCreditsInput, RepayCreditInput } from './credits.schemas';

export interface Credit {
  id: string;
  saleId: string;
  saleReference: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  amountDue: number;
  amountPaid: number;
  amountLeft: number;
  status: string;
  dueDate: string | null;
  openedAt: string;
  settledAt: string | null;
}

interface CreditRow {
  id: string;
  sale_id: string;
  sale_reference: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  amount_due: number;
  amount_paid: number;
  amount_left: number;
  status: string;
  due_date: string | null;
  opened_at: Date;
  settled_at: Date | null;
}

const toCredit = (row: CreditRow): Credit => ({
  id: row.id,
  saleId: row.sale_id,
  saleReference: row.sale_reference,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  amountDue: row.amount_due,
  amountPaid: row.amount_paid,
  amountLeft: row.amount_left,
  status: row.status,
  dueDate: row.due_date,
  openedAt: row.opened_at.toISOString(),
  settledAt: row.settled_at?.toISOString() ?? null,
});

const SELECT = `
  SELECT cr.id, cr.sale_id, s.reference AS sale_reference,
         cr.customer_id, cu.full_name AS customer_name, cu.phone AS customer_phone,
         cr.amount_due, cr.amount_paid, cr.amount_left, cr.status,
         cr.due_date, cr.opened_at, cr.settled_at
    FROM credits cr
    JOIN sales s      ON s.id  = cr.sale_id
    JOIN customers cu ON cu.id = cr.customer_id`;

/** §8 — liste des créances en cours (qui doit combien). */
export async function listCredits(
  restaurantId: string,
  input: ListCreditsInput,
): Promise<Paginated<Credit> & { totalOutstanding: number }> {
  const conditions = ['cr.restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (input.status) {
    params.push(input.status);
    conditions.push(`cr.status = $${params.length}`);
  } else if (input.onlyOpen) {
    conditions.push(`cr.status IN ('open', 'partially_paid')`);
  }

  if (input.customerId) {
    params.push(input.customerId);
    conditions.push(`cr.customer_id = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const summary = await queryOne<{ count: number; outstanding: number }>(
    `SELECT count(*)::int AS count,
            COALESCE(sum(cr.amount_left) FILTER (WHERE cr.status IN ('open','partially_paid')), 0)
              AS outstanding
       FROM credits cr ${where}`,
    params,
  );

  params.push(input.limit, offsetOf(input));
  const rows = await query<CreditRow>(
    `${SELECT} ${where} ORDER BY cr.opened_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    ...paginate(rows.map(toCredit), summary?.count ?? 0, input),
    totalOutstanding: summary?.outstanding ?? 0,
  };
}

export async function getCredit(restaurantId: string, id: string): Promise<
  Credit & { payments: Array<{ id: string; amount: number; paymentMethod: string; note: string | null; paidAt: string }> }
> {
  const row = await queryOne<CreditRow>(`${SELECT} WHERE cr.id = $1 AND cr.restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Créance');

  const payments = await query<{
    id: string;
    amount: number;
    payment_method: string;
    note: string | null;
    paid_at: Date;
  }>(
    `SELECT id, amount, payment_method, note, paid_at
       FROM credit_payments WHERE credit_id = $1 ORDER BY paid_at DESC`,
    [id],
  );

  return {
    ...toCredit(row),
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      paymentMethod: p.payment_method,
      note: p.note,
      paidAt: p.paid_at.toISOString(),
    })),
  };
}

/**
 * §8 — Remboursement (total ou partiel) d'une créance.
 * Effet : − dette du client, + caisse (§7, §10). Les deux écritures sont
 * validées ensemble ; le statut de la créance est recalculé par trigger.
 */
export async function repayCredit(
  restaurantId: string,
  creditId: string,
  userId: string,
  input: RepayCreditInput,
): Promise<Credit> {
  await withTransaction(async (tx) => {
    const credit = await tx.queryOne<{
      id: string;
      status: string;
      amount_left: number;
      customer_name: string;
      sale_reference: string;
    }>(
      `SELECT cr.id, cr.status, cr.amount_left, cu.full_name AS customer_name,
              s.reference AS sale_reference
         FROM credits cr
         JOIN customers cu ON cu.id = cr.customer_id
         JOIN sales s      ON s.id  = cr.sale_id
        WHERE cr.id = $1 AND cr.restaurant_id = $2
        FOR UPDATE OF cr`,
      [creditId, restaurantId],
    );
    if (!credit) throw notFound('Créance');

    if (credit.status === 'paid') throw conflict('Cette créance est déjà entièrement remboursée.');
    if (credit.status === 'cancelled') throw conflict('Cette créance a été annulée.');

    const amount = round2(input.amount);
    if (amount > credit.amount_left) {
      throw unprocessable(
        `Le montant dépasse le solde restant dû (${credit.amount_left}). Saisissez au maximum ce montant.`,
      );
    }

    const paidAt = input.paidAt ?? new Date();

    const payment = await tx.queryOne<{ id: string }>(
      `INSERT INTO credit_payments
         (restaurant_id, credit_id, amount, payment_method, note, paid_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        restaurantId,
        creditId,
        amount,
        input.paymentMethod,
        input.note ?? null,
        paidAt,
        userId,
      ],
    );
    if (!payment) throw new Error('Enregistrement du remboursement impossible.');

    await recordMovement(tx, {
      restaurantId,
      direction: 'in',
      amount,
      category: 'credit_payment',
      label: `Remboursement ${credit.customer_name} — vente ${credit.sale_reference}`,
      sourceType: 'credit_payment',
      sourceId: payment.id,
      paymentMethod: input.paymentMethod,
      occurredAt: paidAt,
      createdBy: userId,
    });
  });

  return getCredit(restaurantId, creditId);
}

/** Total dû par l'ensemble des clients, pour le tableau de bord. */
export async function totalOutstanding(restaurantId: string): Promise<number> {
  const row = await queryOne<{ total: number }>(
    `SELECT COALESCE(sum(amount_left), 0) AS total
       FROM credits
      WHERE restaurant_id = $1 AND status IN ('open', 'partially_paid')`,
    [restaurantId],
  );
  return row?.total ?? 0;
}
