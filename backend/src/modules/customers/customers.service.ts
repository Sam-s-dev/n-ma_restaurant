import { conflict, notFound } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import type { Tx } from '../../db/transaction';
import type {
  CreateCustomerInput,
  ListCustomersInput,
  UpdateCustomerInput,
} from './customers.schemas';

export interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  note: string | null;
  totalDue: number;
  openCredits: number;
  lifetimeCredited: number;
  lifetimeRepaid: number;
  lastCreditAt: string | null;
}

interface CustomerRow {
  id: string;
  full_name: string;
  phone: string | null;
  note: string | null;
  total_due: number;
  open_credits: number;
  lifetime_credited: number;
  lifetime_repaid: number;
  last_credit_at: Date | null;
}

const toCustomer = (row: CustomerRow): Customer => ({
  id: row.id,
  fullName: row.full_name,
  phone: row.phone,
  note: row.note,
  totalDue: row.total_due,
  openCredits: row.open_credits,
  lifetimeCredited: row.lifetime_credited,
  lifetimeRepaid: row.lifetime_repaid,
  lastCreditAt: row.last_credit_at?.toISOString() ?? null,
});

const SELECT = `
  SELECT c.id, c.full_name, c.phone, c.note,
         COALESCE(d.total_due, 0)          AS total_due,
         COALESCE(d.open_credits, 0)::int  AS open_credits,
         COALESCE(d.lifetime_credited, 0)  AS lifetime_credited,
         COALESCE(d.lifetime_repaid, 0)    AS lifetime_repaid,
         d.last_credit_at
    FROM customers c
    LEFT JOIN v_customer_debts d
           ON d.customer_id = c.id AND d.restaurant_id = c.restaurant_id`;

export async function listCustomers(
  restaurantId: string,
  input: ListCustomersInput,
): Promise<{ items: Customer[]; totalDue: number }> {
  const conditions = ['c.restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (input.search) {
    params.push(`%${input.search}%`);
    conditions.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
  }
  if (input.onlyDebtors) conditions.push('COALESCE(d.total_due, 0) > 0');

  const rows = await query<CustomerRow>(
    `${SELECT} WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(d.total_due, 0) DESC, c.full_name`,
    params,
  );

  const items = rows.map(toCustomer);
  return { items, totalDue: items.reduce((sum, c) => sum + c.totalDue, 0) };
}

export async function getCustomer(restaurantId: string, id: string): Promise<Customer> {
  const row = await queryOne<CustomerRow>(`${SELECT} WHERE c.id = $1 AND c.restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Client');
  return toCustomer(row);
}

export async function createCustomer(
  restaurantId: string,
  input: CreateCustomerInput,
): Promise<Customer> {
  if (input.phone) {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM customers WHERE restaurant_id = $1 AND phone = $2',
      [restaurantId, input.phone],
    );
    if (existing) throw conflict('Un client avec ce numéro existe déjà.');
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO customers (restaurant_id, full_name, phone, note)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [restaurantId, input.fullName, input.phone ?? null, input.note ?? null],
  );
  if (!row) throw new Error('Création du client impossible.');
  return getCustomer(restaurantId, row.id);
}

export async function updateCustomer(
  restaurantId: string,
  id: string,
  input: UpdateCustomerInput,
): Promise<Customer> {
  const { setClause, values, nextIndex } = buildUpdate(input, {
    fullName: 'full_name',
    phone: 'phone',
    note: 'note',
  });

  const row = await queryOne<{ id: string }>(
    `UPDATE customers SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1} RETURNING id`,
    [...values, id, restaurantId],
  );
  if (!row) throw notFound('Client');
  return getCustomer(restaurantId, id);
}

export async function deleteCustomer(restaurantId: string, id: string): Promise<void> {
  const debt = await queryOne<{ total_due: number }>(
    'SELECT total_due FROM v_customer_debts WHERE customer_id = $1 AND restaurant_id = $2',
    [id, restaurantId],
  );
  if ((debt?.total_due ?? 0) > 0) {
    throw conflict('Ce client a encore une dette en cours, suppression impossible.');
  }

  try {
    const row = await queryOne(
      'DELETE FROM customers WHERE id = $1 AND restaurant_id = $2 RETURNING id',
      [id, restaurantId],
    );
    if (!row) throw notFound('Client');
  } catch (error) {
    if ((error as { code?: string }).code === '23503') {
      throw conflict('Ce client est lié à des ventes passées et ne peut pas être supprimé.');
    }
    throw error;
  }
}

/**
 * Résout le client d'une vente à crédit : réutilise la fiche existante si le
 * numéro est déjà connu, sinon la crée (§8 — enregistrement du client).
 */
export async function resolveOrCreateCustomer(
  tx: Tx,
  restaurantId: string,
  input: { customerId?: string; fullName?: string; phone?: string | null },
): Promise<string> {
  if (input.customerId) {
    const found = await tx.queryOne<{ id: string }>(
      'SELECT id FROM customers WHERE id = $1 AND restaurant_id = $2',
      [input.customerId, restaurantId],
    );
    if (!found) throw notFound('Client');
    return found.id;
  }

  if (input.phone) {
    const existing = await tx.queryOne<{ id: string }>(
      'SELECT id FROM customers WHERE restaurant_id = $1 AND phone = $2',
      [restaurantId, input.phone],
    );
    if (existing) return existing.id;
  }

  const created = await tx.queryOne<{ id: string }>(
    `INSERT INTO customers (restaurant_id, full_name, phone)
     VALUES ($1, $2, $3) RETURNING id`,
    [restaurantId, input.fullName ?? 'Client', input.phone ?? null],
  );
  if (!created) throw new Error('Création du client impossible.');
  return created.id;
}
