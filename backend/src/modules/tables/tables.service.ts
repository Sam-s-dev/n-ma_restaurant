import { conflict, notFound, unprocessable } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { formatAmount, round2 } from '../../utils/money';
import { resolveOrCreateCustomer } from '../customers/customers.service';
import { notify, type NotifyParams } from '../notifications/notifications.service';
import { insertSaleRecord, type SaleLine } from '../sales/sales.service';
import type { CreateTableInput, PayBillInput, SendItemsInput, UpdateTableInput } from './tables.schemas';

export interface Actor {
  restaurantId: string;
  userId: string;
  userName: string;
}

/** Hors transaction : les mêmes requêtes, sur le pool. */
const direct: Tx = { query, queryOne };

/**
 * Prévient un rôle précis (le cuisinier, le caissier). Si le restaurant
 * n'a personne dans ce rôle, ceux qui ont le droit correspondant — le
 * gérant, souvent — reçoivent l'alerte à sa place : elle ne se perd pas.
 */
export async function notifyRoleOrFallback(
  params: Omit<NotifyParams, 'to'> & { roles: NonNullable<NotifyParams['to']['roles']>; fallback: NonNullable<NotifyParams['to']['permission']> },
  tx: Tx,
): Promise<void> {
  const { roles, fallback, ...rest } = params;
  const sent = await notify({ ...rest, to: { roles } }, tx);
  if (sent === 0) await notify({ ...rest, to: { permission: fallback } }, tx);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export type TableState = 'free' | 'occupied' | 'cooking' | 'ready' | 'bill';

export interface BillSummary {
  id: string;
  reference: string;
  label: string | null;
  guests: number;
  status: 'open' | 'bill_requested';
  waiterName: string | null;
  total: number;
  openedAt: string;
}

export interface DiningTable {
  id: string;
  name: string;
  area: string | null;
  position: number;
  isActive: boolean;
  state: TableState;
  bills: BillSummary[];
}

export async function listTables(restaurantId: string, includeInactive = false): Promise<DiningTable[]> {
  const tables = await query<{ id: string; name: string; area: string | null; position: number; is_active: boolean }>(
    `SELECT id, name, area, position, is_active FROM dining_tables
      WHERE restaurant_id = $1 ${includeInactive ? '' : 'AND is_active'}
      ORDER BY area NULLS FIRST, position, name`,
    [restaurantId],
  );

  const bills = await query<{
    id: string;
    table_id: string;
    reference: string;
    label: string | null;
    guests: number;
    status: 'open' | 'bill_requested';
    waiter_name: string | null;
    opened_at: Date;
    total: number;
    cooking: number;
    ready: number;
  }>(
    `SELECT b.id, b.table_id, b.reference, b.label, b.guests, b.status, u.full_name AS waiter_name,
            b.opened_at,
            COALESCE(sum(i.unit_price * i.quantity) FILTER (WHERE i.status <> 'cancelled'), 0) AS total,
            count(i.id) FILTER (WHERE i.status IN ('sent', 'preparing'))::int AS cooking,
            count(i.id) FILTER (WHERE i.status = 'ready')::int AS ready
       FROM table_bills b
       LEFT JOIN users u ON u.id = b.waiter_id
       LEFT JOIN kitchen_items i ON i.bill_id = b.id
      WHERE b.restaurant_id = $1 AND b.status IN ('open', 'bill_requested')
      GROUP BY b.id, u.full_name
      ORDER BY b.opened_at`,
    [restaurantId],
  );

  return tables.map((table) => {
    const own = bills.filter((bill) => bill.table_id === table.id);
    // L'état le plus urgent l'emporte : une addition demandée avant un plat prêt.
    const state: TableState = own.some((bill) => bill.status === 'bill_requested')
      ? 'bill'
      : own.some((bill) => bill.ready > 0)
        ? 'ready'
        : own.some((bill) => bill.cooking > 0)
          ? 'cooking'
          : own.length > 0
            ? 'occupied'
            : 'free';
    return {
      id: table.id,
      name: table.name,
      area: table.area,
      position: table.position,
      isActive: table.is_active,
      state,
      bills: own.map((bill) => ({
        id: bill.id,
        reference: bill.reference,
        label: bill.label,
        guests: bill.guests,
        status: bill.status,
        waiterName: bill.waiter_name,
        total: round2(bill.total),
        openedAt: bill.opened_at.toISOString(),
      })),
    };
  });
}

function tableConflict(error: unknown): never {
  if ((error as { code?: string }).code === '23505') throw conflict('Une table porte déjà ce nom.');
  throw error;
}

export async function createTable(restaurantId: string, input: CreateTableInput) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO dining_tables (restaurant_id, name, area, position, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [restaurantId, input.name, input.area ?? null, input.position, input.isActive ?? true],
  ).catch(tableConflict);
  if (!row) throw new Error('Création de la table impossible.');
  return row;
}

/** « Table 1 » à « Table N », à la suite des tables existantes. */
export async function createTablesBatch(restaurantId: string, count: number, area: string | null) {
  return withTransaction(async (tx) => {
    const existing = await tx.query<{ name: string }>(
      'SELECT name FROM dining_tables WHERE restaurant_id = $1',
      [restaurantId],
    );
    const taken = new Set(existing.map((row) => row.name.trim().toLowerCase()));
    let created = 0;
    for (let n = 1; created < count && n < 1000; n += 1) {
      const name = `Table ${n}`;
      if (taken.has(name.toLowerCase())) continue;
      await tx.query(
        `INSERT INTO dining_tables (restaurant_id, name, area, position) VALUES ($1, $2, $3, $4)`,
        [restaurantId, name, area, n],
      );
      created += 1;
    }
    return { created };
  });
}

export async function updateTable(restaurantId: string, id: string, input: UpdateTableInput) {
  const { setClause, values, nextIndex } = buildUpdate(input, {
    name: 'name',
    area: 'area',
    position: 'position',
    isActive: 'is_active',
  });
  const row = await queryOne(
    `UPDATE dining_tables SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1} RETURNING id`,
    [...values, id, restaurantId],
  ).catch(tableConflict);
  if (!row) throw notFound('Table');
}

/** Une table qui a déjà servi est retirée du plan, pas effacée : ses additions restent. */
export async function deleteTable(restaurantId: string, id: string): Promise<void> {
  const open = await queryOne(
    `SELECT 1 FROM table_bills WHERE table_id = $1 AND status IN ('open', 'bill_requested')`,
    [id],
  );
  if (open) throw conflict('Cette table a une addition en cours. Encaissez-la d’abord.');
  const used = await queryOne('SELECT 1 FROM table_bills WHERE table_id = $1 LIMIT 1', [id]);
  const row = used
    ? await queryOne(
        'UPDATE dining_tables SET is_active = false WHERE id = $1 AND restaurant_id = $2 RETURNING id',
        [id, restaurantId],
      )
    : await queryOne('DELETE FROM dining_tables WHERE id = $1 AND restaurant_id = $2 RETURNING id', [
        id,
        restaurantId,
      ]);
  if (!row) throw notFound('Table');
}

export async function getKitchenSettings(restaurantId: string) {
  const row = await queryOne<{ warnMinutes: number; lateMinutes: number }>(
    `SELECT kitchen_warn_minutes AS "warnMinutes", kitchen_late_minutes AS "lateMinutes"
       FROM restaurants WHERE id = $1`,
    [restaurantId],
  );
  if (!row) throw notFound('Restaurant');
  return row;
}

export async function updateKitchenSettings(restaurantId: string, warnMinutes: number, lateMinutes: number) {
  await query(
    'UPDATE restaurants SET kitchen_warn_minutes = $2, kitchen_late_minutes = $3 WHERE id = $1',
    [restaurantId, warnMinutes, lateMinutes],
  );
  return getKitchenSettings(restaurantId);
}

// ---------------------------------------------------------------------------
// Additions
// ---------------------------------------------------------------------------

export type ItemStatus = 'sent' | 'preparing' | 'ready' | 'served' | 'cancelled';

export interface BillItem {
  id: string;
  ticketId: string;
  dishId: string | null;
  dishName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  note: string | null;
  status: ItemStatus;
  createdAt: string;
  readyAt: string | null;
  servedAt: string | null;
  cancelledReason: string | null;
}

export interface Bill {
  id: string;
  reference: string;
  tableId: string;
  tableName: string;
  label: string | null;
  guests: number;
  status: 'open' | 'bill_requested' | 'paid' | 'cancelled';
  waiter: { id: string; fullName: string } | null;
  total: number;
  openedAt: string;
  billRequestedAt: string | null;
  paidAt: string | null;
  saleId: string | null;
  saleReference: string | null;
  closedReason: string | null;
  items: BillItem[];
}

interface BillRow {
  id: string;
  reference: string;
  table_id: string;
  table_name: string;
  label: string | null;
  guests: number;
  status: Bill['status'];
  waiter_id: string | null;
  waiter_name: string | null;
  opened_at: Date;
  bill_requested_at: Date | null;
  paid_at: Date | null;
  sale_id: string | null;
  sale_reference: string | null;
  closed_reason: string | null;
}

const BILL_SELECT = `
  SELECT b.id, b.reference, b.table_id, t.name AS table_name, b.label, b.guests, b.status,
         b.waiter_id, u.full_name AS waiter_name, b.opened_at, b.bill_requested_at, b.paid_at,
         b.sale_id, s.reference AS sale_reference, b.closed_reason
    FROM table_bills b
    JOIN dining_tables t ON t.id = b.table_id
    LEFT JOIN users u ON u.id = b.waiter_id
    LEFT JOIN sales s ON s.id = b.sale_id`;

async function withBillItems(rows: BillRow[], runner: Tx = direct): Promise<Bill[]> {
  if (rows.length === 0) return [];
  const items = await runner.query<{
    id: string;
    bill_id: string;
    ticket_id: string;
    dish_id: string | null;
    dish_name: string;
    unit_price: number;
    quantity: number;
    note: string | null;
    status: ItemStatus;
    created_at: Date;
    ready_at: Date | null;
    served_at: Date | null;
    cancelled_reason: string | null;
  }>(
    `SELECT id, bill_id, ticket_id, dish_id, dish_name, unit_price, quantity, note, status,
            created_at, ready_at, served_at, cancelled_reason
       FROM kitchen_items WHERE bill_id = ANY($1::uuid[])
      ORDER BY created_at, dish_name`,
    [rows.map((row) => row.id)],
  );

  return rows.map((row) => {
    const own: BillItem[] = items
      .filter((item) => item.bill_id === row.id)
      .map((item) => ({
        id: item.id,
        ticketId: item.ticket_id,
        dishId: item.dish_id,
        dishName: item.dish_name,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        lineTotal: round2(item.unit_price * item.quantity),
        note: item.note,
        status: item.status,
        createdAt: item.created_at.toISOString(),
        readyAt: item.ready_at?.toISOString() ?? null,
        servedAt: item.served_at?.toISOString() ?? null,
        cancelledReason: item.cancelled_reason,
      }));
    return {
      id: row.id,
      reference: row.reference,
      tableId: row.table_id,
      tableName: row.table_name,
      label: row.label,
      guests: row.guests,
      status: row.status,
      waiter: row.waiter_id ? { id: row.waiter_id, fullName: row.waiter_name ?? 'Serveur' } : null,
      total: round2(own.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.lineTotal, 0)),
      openedAt: row.opened_at.toISOString(),
      billRequestedAt: row.bill_requested_at?.toISOString() ?? null,
      paidAt: row.paid_at?.toISOString() ?? null,
      saleId: row.sale_id,
      saleReference: row.sale_reference,
      closedReason: row.closed_reason,
      items: own,
    };
  });
}

export async function getBill(restaurantId: string, id: string, runner: Tx = direct): Promise<Bill> {
  const row = await runner.queryOne<BillRow>(`${BILL_SELECT} WHERE b.id = $1 AND b.restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Addition');
  const [bill] = await withBillItems([row], runner);
  return bill!;
}

/** Les additions à encaisser : demandées d'abord, puis celles encore ouvertes. */
export async function listBills(restaurantId: string, status: 'open' | 'bill_requested' | 'active' | 'paid') {
  const statuses = status === 'active' ? ['bill_requested', 'open'] : [status];
  const rows = await query<BillRow>(
    `${BILL_SELECT}
      WHERE b.restaurant_id = $1 AND b.status = ANY($2::text[])
        ${status === 'paid' ? "AND b.paid_at >= now() - interval '1 day'" : ''}
      ORDER BY (b.status = 'bill_requested') DESC, COALESCE(b.bill_requested_at, b.opened_at) ${
        status === 'paid' ? 'DESC' : 'ASC'
      }
      LIMIT 100`,
    [restaurantId, statuses],
  );
  return withBillItems(rows);
}

/** Nom affiché d'une addition : « Table 5 · Groupe de 4 », ou son numéro. */
export function billName(tableName: string, label: string | null, reference: string): string {
  return `${tableName} · ${label || `addition ${reference.slice(-4)}`}`;
}

export async function openBill(
  actor: Actor,
  tableId: string,
  input: { label?: string | null; guests: number },
): Promise<Bill> {
  return withTransaction(async (tx) => {
    const table = await tx.queryOne(
      'SELECT 1 FROM dining_tables WHERE id = $1 AND restaurant_id = $2 AND is_active',
      [tableId, actor.restaurantId],
    );
    if (!table) throw notFound('Table');

    const ref = await tx.queryOne<{ reference: string }>(
      `SELECT next_document_reference($1, 'table_bill', 'AD') AS reference`,
      [actor.restaurantId],
    );
    const bill = await tx.queryOne<{ id: string }>(
      `INSERT INTO table_bills (restaurant_id, table_id, reference, label, guests, waiter_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [actor.restaurantId, tableId, ref?.reference ?? `AD-${Date.now()}`, input.label ?? null, input.guests, actor.userId],
    );
    if (!bill) throw new Error('Ouverture de l’addition impossible.');
    return getBill(actor.restaurantId, bill.id, tx);
  });
}

async function lockBill(tx: Tx, restaurantId: string, billId: string) {
  const bill = await tx.queryOne<{
    id: string;
    reference: string;
    status: Bill['status'];
    label: string | null;
    table_name: string;
    waiter_id: string | null;
  }>(
    `SELECT b.id, b.reference, b.status, b.label, t.name AS table_name, b.waiter_id
       FROM table_bills b JOIN dining_tables t ON t.id = b.table_id
      WHERE b.id = $1 AND b.restaurant_id = $2
      FOR UPDATE OF b`,
    [billId, restaurantId],
  );
  if (!bill) throw notFound('Addition');
  return bill;
}

/**
 * Les portions sont prises à l'envoi : la cuisine prépare ce qui est
 * promis, le comptoir et le mini-site ne peuvent plus le vendre.
 */
export async function reservePortions(
  tx: Tx,
  restaurantId: string,
  wanted: Map<string, number>,
) {
  const dishes = await tx.query<{
    id: string;
    name: string;
    price: number;
    is_available: boolean;
    is_archived: boolean;
    available_quantity: number | null;
  }>(
    `SELECT id, name, price, is_available, is_archived, available_quantity
       FROM dishes WHERE restaurant_id = $1 AND id = ANY($2::uuid[])
      ORDER BY id FOR UPDATE`,
    [restaurantId, [...wanted.keys()]],
  );
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));

  for (const [id, quantity] of wanted) {
    const dish = byId.get(id);
    if (!dish || dish.is_archived) throw unprocessable('Un plat n’est plus au menu.');
    if (!dish.is_available) throw unprocessable(`« ${dish.name} » est épuisé.`);
    if (dish.available_quantity !== null && quantity > dish.available_quantity) {
      throw unprocessable(
        dish.available_quantity === 0
          ? `Il ne reste aucune portion de « ${dish.name} ».`
          : `Il ne reste que ${dish.available_quantity} portion(s) de « ${dish.name} ».`,
      );
    }
  }
  for (const [id, quantity] of wanted) {
    if (byId.get(id)!.available_quantity === null) continue;
    await tx.query(
      `UPDATE dishes
          SET available_quantity = available_quantity - $1,
              is_available       = (available_quantity - $1) > 0
        WHERE id = $2 AND restaurant_id = $3`,
      [quantity, id, restaurantId],
    );
  }
  return byId;
}

/** Une portion annulée retourne au plat, qui revient à la carte s'il en était sorti. */
export async function releasePortion(tx: Tx, restaurantId: string, dishId: string | null, quantity: number) {
  if (!dishId) return;
  await tx.query(
    `UPDATE dishes
        SET available_quantity = available_quantity + $1, is_available = true
      WHERE id = $2 AND restaurant_id = $3 AND available_quantity IS NOT NULL AND NOT is_archived`,
    [quantity, dishId, restaurantId],
  );
}

/** Le serveur envoie en cuisine : un ticket de plus pour cette addition. */
export async function sendItems(actor: Actor, billId: string, input: SendItemsInput): Promise<Bill> {
  return withTransaction(async (tx) => {
    const bill = await lockBill(tx, actor.restaurantId, billId);
    if (bill.status !== 'open' && bill.status !== 'bill_requested') {
      throw conflict('Cette addition est close.');
    }

    const wanted = new Map<string, number>();
    for (const item of input.items) wanted.set(item.dishId, (wanted.get(item.dishId) ?? 0) + item.quantity);
    const dishes = await reservePortions(tx, actor.restaurantId, wanted);

    const ticket = await tx.queryOne<{ id: string }>(
      `INSERT INTO kitchen_tickets (restaurant_id, source, bill_id, sent_by)
       VALUES ($1, 'table', $2, $3) RETURNING id`,
      [actor.restaurantId, billId, actor.userId],
    );
    if (!ticket) throw new Error('Envoi impossible.');

    for (const item of input.items) {
      const dish = dishes.get(item.dishId)!;
      await tx.query(
        `INSERT INTO kitchen_items
           (restaurant_id, ticket_id, bill_id, dish_id, dish_name, unit_price, quantity, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [actor.restaurantId, ticket.id, billId, dish.id, dish.name, dish.price, item.quantity, item.note ?? null],
      );
    }

    // Un dessert commandé après avoir demandé l'addition : elle se rouvre,
    // le caissier ne doit pas encaisser un total incomplet.
    if (bill.status === 'bill_requested') {
      await tx.query(`UPDATE table_bills SET status = 'open', bill_requested_at = NULL WHERE id = $1`, [billId]);
    }

    const count = input.items.reduce((sum, item) => sum + item.quantity, 0);
    await notifyRoleOrFallback(
      {
        restaurantId: actor.restaurantId,
        roles: ['cook'],
        fallback: 'kitchen.handle',
        exceptUserId: actor.userId,
        kind: 'kitchen.new',
        title: `Nouveau ticket · ${bill.table_name}`,
        body: input.items
          .map((item) => `${item.quantity} ${dishes.get(item.dishId)!.name}${item.note ? ` (${item.note})` : ''}`)
          .join(', ')
          .slice(0, 300) || `${count} plat(s)`,
        route: 'kitchen',
        entityId: ticket.id,
        actorName: actor.userName,
      },
      tx,
    );

    return getBill(actor.restaurantId, billId, tx);
  });
}

export async function requestBill(actor: Actor, billId: string): Promise<Bill> {
  return withTransaction(async (tx) => {
    const bill = await lockBill(tx, actor.restaurantId, billId);
    if (bill.status === 'bill_requested') throw conflict('L’addition est déjà demandée.');
    if (bill.status !== 'open') throw conflict('Cette addition est close.');

    const current = await getBill(actor.restaurantId, billId, tx);
    if (current.items.every((item) => item.status === 'cancelled')) {
      throw unprocessable('Aucun plat sur cette addition.');
    }

    await sendToCashier(tx, actor, bill, current.total, 'requested');
    return getBill(actor.restaurantId, billId, tx);
  });
}

/**
 * L'addition passe « à encaisser » et le caissier est prévenu : soit le
 * serveur la demande, soit tout vient d'être servi.
 */
async function sendToCashier(
  tx: Tx,
  actor: Actor,
  bill: { id: string; reference: string; label: string | null; table_name: string },
  total: number,
  reason: 'requested' | 'all_served',
) {
  await tx.query(
    `UPDATE table_bills SET status = 'bill_requested', bill_requested_at = now() WHERE id = $1`,
    [bill.id],
  );
  const symbol = await currencyOf(tx, actor.restaurantId);
  const name = billName(bill.table_name, bill.label, bill.reference);
  await notifyRoleOrFallback(
    {
      restaurantId: actor.restaurantId,
      roles: ['cashier'],
      fallback: 'bills.settle',
      exceptUserId: actor.userId,
      kind: 'bill.requested',
      title: reason === 'all_served' ? `À encaisser · ${name}` : `Addition demandée · ${name}`,
      body:
        reason === 'all_served'
          ? `Tout est servi : ${formatAmount(total, symbol)} à encaisser.`
          : `${formatAmount(total, symbol)} à encaisser.`,
      route: 'bills',
      entityId: bill.id,
      actorName: actor.userName,
    },
    tx,
  );
}

async function currencyOf(tx: Tx, restaurantId: string): Promise<string> {
  const row = await tx.queryOne<{ currency_symbol: string }>(
    'SELECT currency_symbol FROM restaurants WHERE id = $1',
    [restaurantId],
  );
  return row?.currency_symbol ?? '';
}

/**
 * Le caissier encaisse : l'addition devient une vente dans la caisse
 * ouverte, le serveur est prévenu, la table se libère d'elle-même quand
 * sa dernière addition est payée.
 */
export async function payBill(actor: Actor, billId: string, input: PayBillInput): Promise<Bill> {
  return withTransaction(async (tx) => {
    const bill = await lockBill(tx, actor.restaurantId, billId);
    if (bill.status !== 'open' && bill.status !== 'bill_requested') {
      throw conflict('Cette addition est déjà close.');
    }
    const current = await getBill(actor.restaurantId, billId, tx);
    const items = current.items.filter((item) => item.status !== 'cancelled');
    if (items.length === 0) throw unprocessable('Aucun plat à encaisser sur cette addition.');

    // Deux envois du même plat au même prix ne font qu'une ligne sur le ticket.
    const grouped = new Map<string, SaleLine>();
    for (const item of items) {
      const key = `${item.dishId ?? item.dishName}|${item.unitPrice}`;
      const line = grouped.get(key);
      if (line) {
        line.quantity += item.quantity;
        line.lineTotal = round2(line.lineTotal + item.lineTotal);
      } else {
        grouped.set(key, {
          dishId: item.dishId,
          dishName: item.dishName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        });
      }
    }
    const lines = [...grouped.values()];
    const totalAmount = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));

    let customerId: string | null = null;
    if (input.customerId) {
      customerId = await resolveOrCreateCustomer(tx, actor.restaurantId, { customerId: input.customerId });
    }

    const soldAt = new Date();
    const sale = await insertSaleRecord(tx, {
      restaurantId: actor.restaurantId,
      userId: actor.userId,
      lines,
      totalAmount,
      paymentMethod: input.paymentMethod,
      customerId,
      note: billName(bill.table_name, bill.label, bill.reference),
      soldAt,
      servedBy: bill.waiter_id,
    });

    if (input.paymentMethod === 'credit') {
      await tx.query(
        `INSERT INTO credits (restaurant_id, sale_id, customer_id, amount_due, due_date, opened_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actor.restaurantId, sale.id, customerId, totalAmount, input.dueDate ?? null, soldAt],
      );
    }

    await tx.query(
      `UPDATE table_bills
          SET status = 'paid', paid_at = now(), paid_by = $1, sale_id = $2, closed_at = now()
        WHERE id = $3`,
      [actor.userId, sale.id, billId],
    );

    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { userIds: [bill.waiter_id] },
        exceptUserId: actor.userId,
        kind: 'bill.paid',
        title: `Addition payée · ${billName(bill.table_name, bill.label, bill.reference)}`,
        body: `${formatAmount(totalAmount, await currencyOf(tx, actor.restaurantId))} encaissés, ticket ${sale.reference}.`,
        route: 'tables',
        entityId: billId,
        actorName: actor.userName,
      },
      tx,
    );
    return getBill(actor.restaurantId, billId, tx);
  });
}

/** Le serveur a posé le plat sur la table. */
export async function markServed(actor: Actor, itemId: string): Promise<Bill> {
  return withTransaction(async (tx) => {
    const item = await tx.queryOne<{ bill_id: string; ticket_id: string; status: ItemStatus }>(
      `SELECT bill_id, ticket_id, status FROM kitchen_items
        WHERE id = $1 AND restaurant_id = $2 AND bill_id IS NOT NULL FOR UPDATE`,
      [itemId, actor.restaurantId],
    );
    if (!item) throw notFound('Plat');
    if (item.status === 'served') throw conflict('Ce plat est déjà servi.');
    if (item.status === 'cancelled') throw conflict('Ce plat a été annulé.');

    await tx.query(`UPDATE kitchen_items SET status = 'served', served_at = now(), ready_at = COALESCE(ready_at, now()) WHERE id = $1`, [itemId]);
    await refreshTicketStatus(tx, item.ticket_id);

    // Le dernier plat est sur la table : l'addition part d'elle-même chez le
    // caissier. Un dessert commandé ensuite la rouvrira.
    const bill = await lockBill(tx, actor.restaurantId, item.bill_id);
    const current = await getBill(actor.restaurantId, item.bill_id, tx);
    const live = current.items.filter((line) => line.status !== 'cancelled');
    if (bill.status === 'open' && live.length > 0 && live.every((line) => line.status === 'served')) {
      await sendToCashier(tx, actor, bill, current.total, 'all_served');
    }
    return getBill(actor.restaurantId, item.bill_id, tx);
  });
}

/**
 * L'état du ticket suit celui de ses plats : tout servi → servi, tout
 * prêt (ou servi) → prêt, tout annulé → annulé.
 */
export async function refreshTicketStatus(tx: Tx, ticketId: string): Promise<string> {
  const counts = await tx.queryOne<{ total: number; cancelled: number; served: number; done: number; preparing: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            count(*) FILTER (WHERE status = 'served')::int AS served,
            count(*) FILTER (WHERE status IN ('ready', 'served'))::int AS done,
            count(*) FILTER (WHERE status = 'preparing')::int AS preparing
       FROM kitchen_items WHERE ticket_id = $1`,
    [ticketId],
  );
  if (!counts) return 'new';
  const live = counts.total - counts.cancelled;
  const status =
    live === 0
      ? 'cancelled'
      : counts.served === live
        ? 'served'
        : counts.done === live
          ? 'ready'
          : counts.preparing > 0 || counts.done > 0
            ? 'preparing'
            : null;
  if (status) {
    await tx.query(
      `UPDATE kitchen_tickets
          SET status = $2,
              started_at = CASE WHEN $2 <> 'cancelled' THEN COALESCE(started_at, now()) ELSE started_at END,
              ready_at = CASE WHEN $2 IN ('ready', 'served') THEN COALESCE(ready_at, now()) ELSE ready_at END
        WHERE id = $1 AND status <> $2`,
      [ticketId, status],
    );
  }
  const row = await tx.queryOne<{ status: string }>('SELECT status FROM kitchen_tickets WHERE id = $1', [ticketId]);
  return row?.status ?? 'new';
}

/** Annuler un plat déjà envoyé : le gérant seul, avec un motif. La cuisine est prévenue. */
export async function cancelItem(actor: Actor, itemId: string, reason: string): Promise<Bill> {
  return withTransaction(async (tx) => {
    const item = await tx.queryOne<{
      bill_id: string;
      ticket_id: string;
      dish_id: string | null;
      dish_name: string;
      quantity: number;
      status: ItemStatus;
    }>(
      `SELECT bill_id, ticket_id, dish_id, dish_name, quantity, status FROM kitchen_items
        WHERE id = $1 AND restaurant_id = $2 AND bill_id IS NOT NULL FOR UPDATE`,
      [itemId, actor.restaurantId],
    );
    if (!item) throw notFound('Plat');
    if (item.status === 'cancelled') throw conflict('Ce plat est déjà annulé.');
    const bill = await lockBill(tx, actor.restaurantId, item.bill_id);
    if (bill.status === 'paid' || bill.status === 'cancelled') throw conflict('Cette addition est close.');

    // Un plat pas encore servi retourne au stock de portions.
    if (item.status !== 'served') await releasePortion(tx, actor.restaurantId, item.dish_id, item.quantity);
    await tx.query(
      `UPDATE kitchen_items SET status = 'cancelled', cancelled_reason = $1, cancelled_by = $2 WHERE id = $3`,
      [reason, actor.userId, itemId],
    );
    await refreshTicketStatus(tx, item.ticket_id);

    const body = `${item.quantity} ${item.dish_name} · ${billName(bill.table_name, bill.label, bill.reference)} : « ${reason} »`;
    if (item.status !== 'served') {
      await notify(
        {
          restaurantId: actor.restaurantId,
          to: { roles: ['cook'] },
          exceptUserId: actor.userId,
          kind: 'kitchen.cancelled',
          title: 'Plat annulé',
          body,
          route: 'kitchen',
          entityId: item.ticket_id,
          actorName: actor.userName,
        },
        tx,
      );
    }
    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { userIds: [bill.waiter_id] },
        exceptUserId: actor.userId,
        kind: 'bill.item_cancelled',
        title: 'Plat annulé',
        body,
        route: 'tables',
        entityId: item.bill_id,
        actorName: actor.userName,
      },
      tx,
    );
    return getBill(actor.restaurantId, item.bill_id, tx);
  });
}

/** Annuler une addition entière (client parti, erreur d'ouverture) : gérant seul. */
export async function cancelBill(actor: Actor, billId: string, reason: string): Promise<Bill> {
  return withTransaction(async (tx) => {
    const bill = await lockBill(tx, actor.restaurantId, billId);
    if (bill.status === 'paid' || bill.status === 'cancelled') throw conflict('Cette addition est déjà close.');

    const items = await tx.query<{ id: string; ticket_id: string; dish_id: string | null; quantity: number; status: ItemStatus }>(
      `SELECT id, ticket_id, dish_id, quantity, status FROM kitchen_items
        WHERE bill_id = $1 AND status <> 'cancelled' FOR UPDATE`,
      [billId],
    );
    for (const item of items) {
      if (item.status !== 'served') await releasePortion(tx, actor.restaurantId, item.dish_id, item.quantity);
    }
    await tx.query(
      `UPDATE kitchen_items SET status = 'cancelled', cancelled_reason = $1, cancelled_by = $2
        WHERE bill_id = $3 AND status <> 'cancelled'`,
      [reason, actor.userId, billId],
    );
    for (const ticketId of new Set(items.map((item) => item.ticket_id))) await refreshTicketStatus(tx, ticketId);

    await tx.query(
      `UPDATE table_bills SET status = 'cancelled', closed_reason = $1, closed_at = now() WHERE id = $2`,
      [reason, billId],
    );
    if (items.some((item) => item.status === 'sent' || item.status === 'preparing')) {
      await notify(
        {
          restaurantId: actor.restaurantId,
          to: { roles: ['cook'] },
          exceptUserId: actor.userId,
          kind: 'kitchen.cancelled',
          title: `Commande annulée · ${bill.table_name}`,
          body: `« ${reason} » : arrêtez la préparation.`,
          route: 'kitchen',
          actorName: actor.userName,
        },
        tx,
      );
    }
    return getBill(actor.restaurantId, billId, tx);
  });
}
