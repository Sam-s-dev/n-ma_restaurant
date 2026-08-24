import { conflict, notFound } from '../../core/errors';
import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2, round3 } from '../../utils/money';
import { recordMovement, reverseMovements } from '../cash/cash.service';
import { applyStockChange } from '../stock/stock.service';
import type { CreateExpenseInput, ListExpensesInput } from './expenses.schemas';

export interface Expense {
  id: string;
  reference: string;
  amount: number;
  category: string;
  description: string;
  expenseDate: string;
  paymentMethod: string;
  stockItemId: string | null;
  stockItemName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  employeeId: string | null;
  employeeName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface ExpenseRow {
  id: string;
  reference: string;
  amount: number;
  category: string;
  description: string;
  expense_date: string;
  payment_method: string;
  stock_item_id: string | null;
  stock_item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  employee_id: string | null;
  employee_name: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_by_name: string | null;
  created_at: Date;
}

const toExpense = (row: ExpenseRow): Expense => ({
  id: row.id,
  reference: row.reference,
  amount: row.amount,
  category: row.category,
  description: row.description,
  expenseDate: row.expense_date,
  paymentMethod: row.payment_method,
  stockItemId: row.stock_item_id,
  stockItemName: row.stock_item_name,
  quantity: row.quantity,
  unitPrice: row.unit_price,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  cancelledAt: row.cancelled_at?.toISOString() ?? null,
  cancelReason: row.cancel_reason,
  createdByName: row.created_by_name,
  createdAt: row.created_at.toISOString(),
});

const SELECT = `
  SELECT e.id, e.reference, e.amount, e.category, e.description, e.expense_date,
         e.payment_method, e.stock_item_id, si.name AS stock_item_name,
         e.quantity, e.unit_price, e.employee_id, emp.full_name AS employee_name,
         e.cancelled_at, e.cancel_reason, u.full_name AS created_by_name, e.created_at
    FROM expenses e
    LEFT JOIN stock_items si ON si.id = e.stock_item_id
    LEFT JOIN employees emp  ON emp.id = e.employee_id
    LEFT JOIN users u        ON u.id = e.created_by`;

/**
 * Écrit une dépense, débite la caisse et — s'il s'agit d'un achat de stock —
 * incrémente la quantité du produit. Réutilisé par le module Personnel pour
 * les paiements de salaire, d'où l'exposition du contexte transactionnel.
 * (§9, §10)
 */
export async function insertExpense(
  tx: Tx,
  params: {
    restaurantId: string;
    userId: string;
    amount: number;
    category: string;
    description: string;
    expenseDate: string;
    paymentMethod: 'cash' | 'mobile_money' | 'card' | 'bank_transfer';
    stockItemId?: string | null;
    quantity?: number | null;
    employeeId?: string | null;
    cashCategory?: 'expense' | 'salary';
  },
): Promise<string> {
  const amount = round2(params.amount);
  const quantity = params.quantity != null ? round3(params.quantity) : null;
  // Prix unitaire déduit du montant total et de la quantité achetée.
  const unitPrice = quantity && quantity > 0 ? round2(amount / quantity) : null;

  const refRow = await tx.queryOne<{ reference: string }>(
    `SELECT next_document_reference($1, 'expense', 'D', $2::date) AS reference`,
    [params.restaurantId, params.expenseDate],
  );
  const reference = refRow?.reference ?? `D-${Date.now()}`;

  const expense = await tx.queryOne<{ id: string }>(
    `INSERT INTO expenses
       (restaurant_id, reference, amount, category, description, expense_date,
        payment_method, stock_item_id, quantity, unit_price, employee_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      params.restaurantId,
      reference,
      amount,
      params.category,
      params.description,
      params.expenseDate,
      params.paymentMethod,
      params.stockItemId ?? null,
      quantity,
      unitPrice,
      params.employeeId ?? null,
      params.userId,
    ],
  );
  if (!expense) throw new Error('Enregistrement de la dépense impossible.');

  // − Caisse (§10)
  await recordMovement(tx, {
    restaurantId: params.restaurantId,
    direction: 'out',
    amount,
    category: params.cashCategory ?? 'expense',
    label: `${reference} — ${params.description}`,
    sourceType: 'expense',
    sourceId: expense.id,
    paymentMethod: params.paymentMethod,
    occurredAt: new Date(`${params.expenseDate}T12:00:00Z`),
    createdBy: params.userId,
  });

  // + Stock du produit (§9)
  if (params.stockItemId && quantity) {
    await applyStockChange(tx, {
      restaurantId: params.restaurantId,
      stockItemId: params.stockItemId,
      direction: 'in',
      quantity,
      unitPrice,
      reason: 'purchase',
      sourceType: 'expense',
      sourceId: expense.id,
      note: params.description,
      createdBy: params.userId,
    });
  }

  return expense.id;
}

export async function createExpense(
  restaurantId: string,
  userId: string,
  input: CreateExpenseInput,
): Promise<Expense> {
  const id = await withTransaction((tx) =>
    insertExpense(tx, {
      restaurantId,
      userId,
      amount: input.amount,
      category: input.category,
      description: input.description,
      expenseDate: input.expenseDate ?? new Date().toISOString().slice(0, 10),
      paymentMethod: input.paymentMethod,
      stockItemId: input.stockItemId ?? null,
      quantity: input.quantity ?? null,
    }),
  );
  return getExpense(restaurantId, id);
}

export async function getExpense(restaurantId: string, id: string): Promise<Expense> {
  const row = await queryOne<ExpenseRow>(`${SELECT} WHERE e.id = $1 AND e.restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Dépense');
  return toExpense(row);
}

export async function listExpenses(
  restaurantId: string,
  input: ListExpensesInput,
): Promise<Paginated<Expense> & { totals: { amount: number; byCategory: Record<string, number> } }> {
  const conditions = ['e.restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (!input.includeCancelled) conditions.push('e.cancelled_at IS NULL');
  if (input.category) {
    params.push(input.category);
    conditions.push(`e.category = $${params.length}`);
  }
  if (input.stockItemId) {
    params.push(input.stockItemId);
    conditions.push(`e.stock_item_id = $${params.length}`);
  }
  if (input.from) {
    params.push(input.from);
    conditions.push(`e.expense_date >= $${params.length}::date`);
  }
  if (input.to) {
    params.push(input.to);
    conditions.push(`e.expense_date <= $${params.length}::date`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const summary = await queryOne<{ count: number; amount: number }>(
    `SELECT count(*)::int AS count, COALESCE(sum(e.amount), 0) AS amount
       FROM expenses e ${where}`,
    params,
  );

  const byCategoryRows = await query<{ category: string; total: number }>(
    `SELECT e.category, sum(e.amount) AS total FROM expenses e ${where} GROUP BY e.category`,
    params,
  );

  params.push(input.limit, offsetOf(input));
  const rows = await query<ExpenseRow>(
    `${SELECT} ${where}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    ...paginate(rows.map(toExpense), summary?.count ?? 0, input),
    totals: {
      amount: summary?.amount ?? 0,
      byCategory: Object.fromEntries(byCategoryRows.map((r) => [r.category, r.total])),
    },
  };
}

/**
 * Annulation : contre-passe le mouvement de caisse et, pour un achat de
 * stock, retire la quantité qui avait été ajoutée.
 */
export async function cancelExpense(
  restaurantId: string,
  id: string,
  userId: string,
  reason: string,
): Promise<Expense> {
  await withTransaction(async (tx) => {
    const expense = await tx.queryOne<{
      id: string;
      reference: string;
      cancelled_at: Date | null;
      stock_item_id: string | null;
      quantity: number | null;
      category: string;
    }>(
      `SELECT id, reference, cancelled_at, stock_item_id, quantity, category
         FROM expenses WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [id, restaurantId],
    );
    if (!expense) throw notFound('Dépense');
    if (expense.cancelled_at) throw conflict('Cette dépense est déjà annulée.');
    if (expense.category === 'salary') {
      throw conflict(
        'Un paiement de salaire s’annule depuis la fiche employé (module Personnel).',
      );
    }

    await reverseMovements(tx, {
      restaurantId,
      sourceType: 'expense',
      sourceId: id,
      label: `Annulation dépense ${expense.reference} — ${reason}`,
      createdBy: userId,
    });

    if (expense.stock_item_id && expense.quantity) {
      await applyStockChange(tx, {
        restaurantId,
        stockItemId: expense.stock_item_id,
        direction: 'out',
        quantity: expense.quantity,
        reason: 'adjustment',
        sourceType: 'expense',
        sourceId: id,
        note: `Annulation dépense ${expense.reference}`,
        createdBy: userId,
      });
    }

    await tx.query(
      'UPDATE expenses SET cancelled_at = now(), cancel_reason = $1 WHERE id = $2',
      [reason, id],
    );
  });

  return getExpense(restaurantId, id);
}
