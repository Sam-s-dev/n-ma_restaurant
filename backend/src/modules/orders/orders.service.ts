import { conflict, notFound, unprocessable } from '../../core/errors';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { formatAmount, round2 } from '../../utils/money';
import { resolveOrCreateCustomer } from '../customers/customers.service';
import { closeOnlineTicket, createOnlineTicket } from '../kitchen/kitchen.service';
import { notify } from '../notifications/notifications.service';
import { pushToOrder } from '../push/push.service';
import { insertSaleRecord, type SaleLine } from '../sales/sales.service';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface OrderItem {
  dishId: string | null;
  dishName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OnlineOrder {
  id: string;
  reference: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  mode: 'delivery' | 'pickup';
  zoneName: string | null;
  landmark: string | null;
  note: string | null;
  paymentMethod: 'cash' | 'mobile_money';
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  status: OrderStatus;
  driver: { id: string; fullName: string; phone: string | null } | null;
  collectedMethod: 'cash' | 'mobile_money' | null;
  deliveryIssue: string | null;
  closedReason: string | null;
  cancelledByCustomer: boolean;
  saleId: string | null;
  saleReference: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  items: OrderItem[];
}

interface OrderRow {
  id: string;
  reference: string;
  tracking_code: string;
  customer_name: string;
  customer_phone: string;
  mode: 'delivery' | 'pickup';
  zone_name: string | null;
  landmark: string | null;
  note: string | null;
  payment_method: 'cash' | 'mobile_money';
  items_total: number;
  delivery_fee: number;
  total_amount: number;
  status: OrderStatus;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  collected_method: 'cash' | 'mobile_money' | null;
  delivery_issue: string | null;
  closed_reason: string | null;
  cancelled_by_customer: boolean;
  sale_id: string | null;
  sale_reference: string | null;
  created_at: Date;
  accepted_at: Date | null;
  ready_at: Date | null;
  dispatched_at: Date | null;
  delivered_at: Date | null;
  completed_at: Date | null;
  closed_at: Date | null;
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

const toOrder = (row: OrderRow, items: OrderItem[]): OnlineOrder => ({
  id: row.id,
  reference: row.reference,
  trackingCode: row.tracking_code,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  mode: row.mode,
  zoneName: row.zone_name,
  landmark: row.landmark,
  note: row.note,
  paymentMethod: row.payment_method,
  itemsTotal: row.items_total,
  deliveryFee: row.delivery_fee,
  totalAmount: row.total_amount,
  status: row.status,
  driver: row.driver_id
    ? { id: row.driver_id, fullName: row.driver_name ?? 'Livreur', phone: row.driver_phone }
    : null,
  collectedMethod: row.collected_method,
  deliveryIssue: row.delivery_issue,
  closedReason: row.closed_reason,
  cancelledByCustomer: row.cancelled_by_customer,
  saleId: row.sale_id,
  saleReference: row.sale_reference,
  createdAt: row.created_at.toISOString(),
  acceptedAt: iso(row.accepted_at),
  readyAt: iso(row.ready_at),
  dispatchedAt: iso(row.dispatched_at),
  deliveredAt: iso(row.delivered_at),
  completedAt: iso(row.completed_at),
  closedAt: iso(row.closed_at),
  items,
});

const ORDER_SELECT = `
  SELECT o.id, o.reference, o.tracking_code, o.customer_name, o.customer_phone, o.mode,
         o.zone_name, o.landmark, o.note, o.payment_method, o.items_total, o.delivery_fee,
         o.total_amount, o.status, o.driver_id, d.full_name AS driver_name, d.phone AS driver_phone,
         o.collected_method, o.delivery_issue, o.closed_reason, o.cancelled_by_customer,
         o.sale_id, s.reference AS sale_reference, o.created_at, o.accepted_at, o.ready_at,
         o.dispatched_at, o.delivered_at, o.completed_at, o.closed_at
    FROM online_orders o
    LEFT JOIN users d ON d.id = o.driver_id
    LEFT JOIN sales s ON s.id = o.sale_id`;

/** Hors transaction : les mêmes requêtes, sur le pool. */
const direct: Tx = { query, queryOne };

async function withItems(rows: OrderRow[], runner: Tx = direct): Promise<OnlineOrder[]> {
  if (rows.length === 0) return [];
  const items = await runner.query<{
    order_id: string;
    dish_id: string | null;
    dish_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>(
    `SELECT order_id, dish_id, dish_name, unit_price, quantity, line_total
       FROM online_order_items WHERE order_id = ANY($1::uuid[])
      ORDER BY dish_name`,
    [rows.map((row) => row.id)],
  );
  const byOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const list = byOrder.get(item.order_id) ?? [];
    list.push({
      dishId: item.dish_id,
      dishName: item.dish_name,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      lineTotal: item.line_total,
    });
    byOrder.set(item.order_id, list);
  }
  return rows.map((row) => toOrder(row, byOrder.get(row.id) ?? []));
}

export async function loadOrder(
  restaurantId: string,
  orderId: string,
  runner: Tx = direct,
): Promise<OnlineOrder> {
  const row = await runner.queryOne<OrderRow>(
    `${ORDER_SELECT} WHERE o.id = $1 AND o.restaurant_id = $2`,
    [orderId, restaurantId],
  );
  if (!row) throw notFound('Commande');
  const [order] = await withItems([row], runner);
  return order!;
}

export async function loadOrderByTracking(code: string): Promise<OnlineOrder & { restaurantId: string }> {
  const row = await queryOne<OrderRow & { restaurant_id: string }>(
    `${ORDER_SELECT.replace('SELECT o.id,', 'SELECT o.restaurant_id, o.id,')} WHERE o.tracking_code = $1`,
    [code],
  );
  if (!row) throw notFound('Commande');
  const [order] = await withItems([row]);
  return { ...order!, restaurantId: row.restaurant_id };
}

// ---------------------------------------------------------------------------
// Liste côté restaurant
// ---------------------------------------------------------------------------

const GROUPS = {
  active: ['pending', 'accepted', 'ready', 'out_for_delivery'],
  to_settle: ['delivered'],
  closed: ['completed', 'rejected', 'cancelled'],
} as const;
export type OrderGroup = keyof typeof GROUPS;

export async function listOrders(
  restaurantId: string,
  group: OrderGroup,
): Promise<{ data: OnlineOrder[]; counts: Record<OrderGroup | 'pending', number> }> {
  const statuses = GROUPS[group];
  // Les commandes closes : celles des sept derniers jours suffisent à
  // l'écran ; l'historique complet est dans les ventes.
  const rows = await query<OrderRow>(
    `${ORDER_SELECT}
      WHERE o.restaurant_id = $1 AND o.status = ANY($2::text[])
        ${group === 'closed' ? "AND o.created_at >= now() - interval '7 days'" : ''}
      ORDER BY ${group === 'closed' ? 'o.created_at DESC' : 'o.created_at ASC'}
      LIMIT 100`,
    [restaurantId, statuses],
  );

  const counts = await queryOne<Record<OrderGroup | 'pending', number>>(
    `SELECT count(*) FILTER (WHERE status = ANY($2::text[]))::int AS active,
            count(*) FILTER (WHERE status = 'pending')::int         AS pending,
            count(*) FILTER (WHERE status = 'delivered')::int       AS to_settle,
            count(*) FILTER (WHERE status = ANY($3::text[])
                              AND created_at >= now() - interval '7 days')::int AS closed
       FROM online_orders WHERE restaurant_id = $1`,
    [restaurantId, GROUPS.active, GROUPS.closed],
  );

  return {
    data: await withItems(rows),
    counts: counts ?? { active: 0, pending: 0, to_settle: 0, closed: 0 },
  };
}

/** Livreurs du restaurant, avec leurs courses en cours et l'argent à reverser. */
export async function listDrivers(restaurantId: string) {
  return query<{
    id: string;
    fullName: string;
    phone: string | null;
    activeCount: number;
    toHandOverCount: number;
    toHandOver: number;
  }>(
    `SELECT u.id, u.full_name AS "fullName", u.phone,
            count(o.id) FILTER (WHERE o.status IN ('accepted', 'ready', 'out_for_delivery'))::int
              AS "activeCount",
            count(o.id) FILTER (WHERE o.status = 'delivered')::int AS "toHandOverCount",
            COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) AS "toHandOver"
       FROM users u
       LEFT JOIN online_orders o ON o.driver_id = u.id AND o.restaurant_id = u.restaurant_id
      WHERE u.restaurant_id = $1 AND u.role = 'driver' AND u.is_active
      GROUP BY u.id
      ORDER BY u.full_name`,
    [restaurantId],
  );
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export interface Actor {
  restaurantId: string;
  userId: string;
  userName: string;
}

async function lockOrder(tx: Tx, restaurantId: string, orderId: string) {
  const row = await tx.queryOne<{
    id: string;
    reference: string;
    status: OrderStatus;
    mode: 'delivery' | 'pickup';
    driver_id: string | null;
    accepted_at: Date | null;
    customer_name: string;
    customer_phone: string;
    zone_name: string | null;
    delivery_fee: number;
    total_amount: number;
    collected_method: 'cash' | 'mobile_money' | null;
    payment_method: 'cash' | 'mobile_money';
  }>(
    `SELECT id, reference, status, mode, driver_id, accepted_at, customer_name, customer_phone,
            zone_name, delivery_fee, total_amount, collected_method, payment_method
       FROM online_orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
    [orderId, restaurantId],
  );
  if (!row) throw notFound('Commande');
  return row;
}

/**
 * Prévient le client sur son téléphone, s'il l'a demandé depuis sa page de
 * suivi. Le message part une fois l'étape enregistrée.
 */
async function tellCustomer(tx: Tx, orderId: string, title: string, body: string) {
  const row = await tx.queryOne<{ tracking_code: string; name: string }>(
    `SELECT o.tracking_code, r.name FROM online_orders o JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.id = $1`,
    [orderId],
  );
  if (!row) return;
  const send = () =>
    void pushToOrder(orderId, {
      title: `${title} · ${row.name}`,
      body,
      url: `/suivi/${row.tracking_code}`,
      tag: `order:${orderId}`,
    });
  if (tx.afterCommit) tx.afterCommit(send);
  else send();
}

function expectStatus(current: OrderStatus, allowed: OrderStatus[], message: string) {
  if (!allowed.includes(current)) throw conflict(message, { status: current });
}

async function currencyOf(tx: Tx, restaurantId: string): Promise<string> {
  const row = await tx.queryOne<{ currency_symbol: string }>(
    'SELECT currency_symbol FROM restaurants WHERE id = $1',
    [restaurantId],
  );
  return row?.currency_symbol ?? '';
}

/**
 * Acceptée après l'appel au client : les portions sont réservées tout de
 * suite. Sans cela, le comptoir pourrait vendre la dernière portion d'un
 * plat promis à un client qui attend chez lui.
 */
export async function acceptOrder(actor: Actor, orderId: string): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.restaurantId, orderId);
    expectStatus(order.status, ['pending'], 'Cette commande a déjà été traitée.');

    const lines = await tx.query<{ dish_id: string | null; dish_name: string; quantity: number }>(
      `SELECT dish_id, dish_name, sum(quantity)::int AS quantity
         FROM online_order_items WHERE order_id = $1
        GROUP BY dish_id, dish_name`,
      [orderId],
    );
    const dishIds = lines.map((line) => line.dish_id).filter((id): id is string => Boolean(id));
    const dishes = await tx.query<{
      id: string;
      name: string;
      is_available: boolean;
      is_archived: boolean;
      available_quantity: number | null;
    }>(
      `SELECT id, name, is_available, is_archived, available_quantity
         FROM dishes WHERE restaurant_id = $1 AND id = ANY($2::uuid[])
        ORDER BY id FOR UPDATE`,
      [actor.restaurantId, dishIds],
    );
    const byId = new Map(dishes.map((dish) => [dish.id, dish]));

    for (const line of lines) {
      const dish = line.dish_id ? byId.get(line.dish_id) : undefined;
      if (!dish || dish.is_archived) {
        throw unprocessable(`« ${line.dish_name} » n’est plus au menu. Refusez la commande ou appelez le client.`);
      }
      if (!dish.is_available) {
        throw unprocessable(`« ${dish.name} » est en rupture. Refusez la commande ou appelez le client.`);
      }
      if (dish.available_quantity !== null && line.quantity > dish.available_quantity) {
        throw unprocessable(
          `Il ne reste que ${dish.available_quantity} portion(s) de « ${dish.name} ».`,
        );
      }
    }

    for (const line of lines) {
      const dish = byId.get(line.dish_id!)!;
      if (dish.available_quantity === null) continue;
      await tx.query(
        `UPDATE dishes
            SET available_quantity = available_quantity - $1,
                is_available       = (available_quantity - $1) > 0
          WHERE id = $2 AND restaurant_id = $3`,
        [line.quantity, dish.id, actor.restaurantId],
      );
    }

    await tx.query(
      `UPDATE online_orders SET status = 'accepted', accepted_at = now(), accepted_by = $1
        WHERE id = $2`,
      [actor.userId, orderId],
    );
    // La cuisine reçoit la commande sur le même écran que les tables.
    await createOnlineTicket(tx, actor.restaurantId, orderId, actor.userId);
    await tellCustomer(tx, orderId, 'Commande confirmée', 'Le restaurant prépare votre commande.');
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

/** Les portions réservées à l'acceptation retournent au plat. */
async function releasePortions(tx: Tx, restaurantId: string, orderId: string) {
  await tx.query(
    `UPDATE dishes d
        SET available_quantity = d.available_quantity + line.quantity,
            is_available       = true
       FROM (SELECT dish_id, sum(quantity)::int AS quantity
               FROM online_order_items
              WHERE order_id = $1 AND dish_id IS NOT NULL
              GROUP BY dish_id) AS line
      WHERE d.id = line.dish_id
        AND d.restaurant_id = $2
        AND d.available_quantity IS NOT NULL
        AND NOT d.is_archived`,
    [orderId, restaurantId],
  );
}

export async function rejectOrder(actor: Actor, orderId: string, reason: string): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.restaurantId, orderId);
    expectStatus(order.status, ['pending'], 'Seule une commande en attente peut être refusée.');
    await tx.query(
      `UPDATE online_orders SET status = 'rejected', closed_reason = $1, closed_at = now()
        WHERE id = $2`,
      [reason, orderId],
    );
    await tellCustomer(tx, orderId, 'Commande refusée', reason);
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

export async function markReady(actor: Actor, orderId: string): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.restaurantId, orderId);
    expectStatus(order.status, ['accepted'], 'Seule une commande en préparation peut être marquée prête.');
    await tx.query(`UPDATE online_orders SET status = 'ready', ready_at = now() WHERE id = $1`, [
      orderId,
    ]);
    await closeOnlineTicket(tx, orderId, 'served');
    if (order.mode === 'pickup') {
      await tellCustomer(tx, orderId, 'Votre commande est prête', 'Vous pouvez venir la chercher au restaurant.');
    }

    if (order.driver_id) {
      await notify(
        {
          restaurantId: actor.restaurantId,
          to: { userIds: [order.driver_id] },
          kind: 'delivery.ready',
          title: 'Commande prête à partir',
          body: `${order.reference} · ${order.customer_name}${order.zone_name ? ` · ${order.zone_name}` : ''}`,
          route: 'deliveries',
          entityId: orderId,
          actorName: actor.userName,
        },
        tx,
      );
    }
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

/** Confiée à un livreur du restaurant ; on peut changer de livreur tant qu'elle n'est pas partie. */
export async function assignDriver(
  actor: Actor,
  orderId: string,
  driverId: string,
): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.restaurantId, orderId);
    if (order.mode !== 'delivery') throw unprocessable('Cette commande est à retirer sur place.');
    expectStatus(
      order.status,
      ['accepted', 'ready'],
      'On confie une commande au livreur une fois acceptée, avant son départ.',
    );

    const driver = await tx.queryOne<{ id: string }>(
      `SELECT id FROM users
        WHERE id = $1 AND restaurant_id = $2 AND role = 'driver' AND is_active`,
      [driverId, actor.restaurantId],
    );
    if (!driver) throw notFound('Livreur');

    await tx.query(
      `UPDATE online_orders SET driver_id = $1, assigned_at = now(), delivery_issue = NULL
        WHERE id = $2`,
      [driverId, orderId],
    );

    const symbol = await currencyOf(tx, actor.restaurantId);
    if (order.driver_id && order.driver_id !== driverId) {
      await notify(
        {
          restaurantId: actor.restaurantId,
          to: { userIds: [order.driver_id] },
          kind: 'delivery.unassigned',
          title: 'Course retirée',
          body: `${order.reference} a été confiée à un autre livreur.`,
          route: 'deliveries',
          entityId: orderId,
          actorName: actor.userName,
        },
        tx,
      );
    }
    if (order.driver_id !== driverId) {
      await notify(
        {
          restaurantId: actor.restaurantId,
          to: { userIds: [driverId] },
          kind: 'delivery.assigned',
          title: 'Nouvelle course',
          body: `${order.reference} · ${order.customer_name}${
            order.zone_name ? ` · ${order.zone_name}` : ''
          } · ${formatAmount(order.total_amount, symbol)} à encaisser`,
          route: 'deliveries',
          entityId: orderId,
          actorName: actor.userName,
        },
        tx,
      );
    }
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

export async function cancelOrder(actor: Actor, orderId: string, reason: string): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.restaurantId, orderId);
    expectStatus(
      order.status,
      ['pending', 'accepted', 'ready', 'out_for_delivery'],
      order.status === 'delivered'
        ? 'Cette commande est déjà livrée : encaissez l’argent du livreur.'
        : 'Cette commande est déjà close.',
    );
    if (order.accepted_at) await releasePortions(tx, actor.restaurantId, orderId);
    await closeOnlineTicket(tx, orderId, 'cancelled');
    await tx.query(
      `UPDATE online_orders SET status = 'cancelled', closed_reason = $1, closed_at = now()
        WHERE id = $2`,
      [reason, orderId],
    );
    await tellCustomer(tx, orderId, 'Commande annulée', reason);
    if (order.driver_id) {
      await notify(
        {
          restaurantId: actor.restaurantId,
          to: { userIds: [order.driver_id] },
          kind: 'delivery.cancelled',
          title: 'Course annulée',
          body: `${order.reference} · ${order.customer_name} : « ${reason} »`,
          route: 'deliveries',
          entityId: orderId,
          actorName: actor.userName,
        },
        tx,
      );
    }
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

/** Le client annule lui-même, tant que le restaurant n'a rien commencé. */
export async function cancelByCustomer(restaurantId: string, orderId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const order = await lockOrder(tx, restaurantId, orderId);
    expectStatus(
      order.status,
      ['pending'],
      'Le restaurant a déjà accepté votre commande. Appelez-le pour l’annuler.',
    );
    await tx.query(
      `UPDATE online_orders
          SET status = 'cancelled', closed_reason = 'Annulée par le client',
              cancelled_by_customer = true, closed_at = now()
        WHERE id = $1`,
      [orderId],
    );
    await notify(
      {
        restaurantId,
        to: { permission: 'orders.manage' },
        kind: 'order.cancelled',
        title: 'Commande annulée par le client',
        body: `${order.reference} · ${order.customer_name}`,
        route: 'orders',
        entityId: orderId,
      },
      tx,
    );
  });
}

/**
 * L'argent est en caisse : la commande devient une vente.
 *
 * Retrait sur place : le client paie au comptoir, le caissier indique
 * comment. Livraison : le livreur revient avec l'argent, le mode est celui
 * qu'il a déclaré à la livraison. La vente entre dans la caisse ouverte,
 * le client rejoint le carnet d'adresses.
 */
export async function completeOrder(
  actor: Actor,
  orderId: string,
  paymentMethod?: 'cash' | 'mobile_money',
): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, actor.restaurantId, orderId);
    let method: 'cash' | 'mobile_money';
    if (order.mode === 'pickup') {
      expectStatus(
        order.status,
        ['accepted', 'ready'],
        'Acceptez la commande avant de la remettre au client.',
      );
      method = paymentMethod ?? order.payment_method;
    } else {
      expectStatus(
        order.status,
        ['delivered'],
        'Le livreur n’a pas encore marqué cette commande comme livrée.',
      );
      method = order.collected_method ?? order.payment_method;
    }

    const items = await tx.query<{
      dish_id: string | null;
      dish_name: string;
      unit_price: number;
      quantity: number;
      line_total: number;
    }>(
      `SELECT dish_id, dish_name, unit_price, quantity, line_total
         FROM online_order_items WHERE order_id = $1 ORDER BY dish_name`,
      [orderId],
    );
    const lines: SaleLine[] = items.map((item) => ({
      dishId: item.dish_id,
      dishName: item.dish_name,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      lineTotal: item.line_total,
    }));
    if (order.delivery_fee > 0) {
      lines.push({
        dishId: null,
        dishName: `Livraison${order.zone_name ? ` — ${order.zone_name}` : ''}`,
        unitPrice: order.delivery_fee,
        quantity: 1,
        lineTotal: order.delivery_fee,
      });
    }

    const customerId = await resolveOrCreateCustomer(tx, actor.restaurantId, {
      fullName: order.customer_name,
      phone: order.customer_phone,
    });

    const sale = await insertSaleRecord(tx, {
      restaurantId: actor.restaurantId,
      userId: actor.userId,
      lines,
      totalAmount: round2(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
      paymentMethod: method,
      customerId,
      note: `Commande en ligne ${order.reference}`,
      soldAt: new Date(),
    });

    await tx.query(
      `UPDATE online_orders
          SET status = 'completed', completed_at = now(), completed_by = $1,
              sale_id = $2, collected_method = COALESCE(collected_method, $3)
        WHERE id = $4`,
      [actor.userId, sale.id, method, orderId],
    );
    await closeOnlineTicket(tx, orderId, 'served');
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

// ---------------------------------------------------------------------------
// Côté livreur : uniquement ses propres courses
// ---------------------------------------------------------------------------

export async function listMyDeliveries(restaurantId: string, driverId: string) {
  const rows = await query<OrderRow>(
    `${ORDER_SELECT}
      WHERE o.restaurant_id = $1 AND o.driver_id = $2
        AND (o.status IN ('accepted', 'ready', 'out_for_delivery', 'delivered')
             OR (o.status = 'completed' AND o.completed_at >= date_trunc('day', now())))
      ORDER BY CASE o.status
                 WHEN 'out_for_delivery' THEN 0 WHEN 'ready' THEN 1 WHEN 'accepted' THEN 2
                 WHEN 'delivered' THEN 3 ELSE 4 END,
               o.created_at`,
    [restaurantId, driverId],
  );
  const data = await withItems(rows);
  const toHandOver = round2(
    data.filter((order) => order.status === 'delivered').reduce((sum, order) => sum + order.totalAmount, 0),
  );
  return { data, toHandOver };
}

async function lockMine(tx: Tx, actor: Actor, orderId: string) {
  const order = await lockOrder(tx, actor.restaurantId, orderId);
  // Une course d'un collègue répond « introuvable » : il n'a pas à la voir.
  if (order.driver_id !== actor.userId) throw notFound('Commande');
  return order;
}

export async function dispatchOrder(actor: Actor, orderId: string): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockMine(tx, actor, orderId);
    expectStatus(order.status, ['accepted', 'ready'], 'Cette course est déjà partie ou close.');
    await tx.query(
      `UPDATE online_orders
          SET status = 'out_for_delivery', dispatched_at = now(), delivery_issue = NULL,
              ready_at = COALESCE(ready_at, now())
        WHERE id = $1`,
      [orderId],
    );
    await closeOnlineTicket(tx, orderId, 'served');
    await tellCustomer(
      tx,
      orderId,
      'Votre commande est en route',
      `${actor.userName.split(' ')[0]} vous l’apporte. Gardez votre téléphone près de vous.`,
    );
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

export async function deliverOrder(
  actor: Actor,
  orderId: string,
  collectedMethod: 'cash' | 'mobile_money',
): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockMine(tx, actor, orderId);
    expectStatus(order.status, ['out_for_delivery'], 'Marquez d’abord la course comme partie.');
    await tx.query(
      `UPDATE online_orders
          SET status = 'delivered', delivered_at = now(), collected_method = $1
        WHERE id = $2`,
      [collectedMethod, orderId],
    );
    await tellCustomer(tx, orderId, 'Commande livrée', 'Bon appétit, et merci de votre commande !');

    const symbol = await currencyOf(tx, actor.restaurantId);
    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { permission: 'orders.manage' },
        exceptUserId: actor.userId,
        kind: 'order.delivered',
        title: 'Commande livrée',
        body: `${order.reference} · ${formatAmount(order.total_amount, symbol)} ${
          collectedMethod === 'cash' ? 'en espèces' : 'en Mobile Money'
        } à recevoir de ${actor.userName}.`,
        route: 'orders',
        entityId: orderId,
        actorName: actor.userName,
      },
      tx,
    );
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}

/** Client injoignable, mauvaise adresse… La commande revient au restaurant. */
export async function reportIssue(actor: Actor, orderId: string, issue: string): Promise<OnlineOrder> {
  return withTransaction(async (tx) => {
    const order = await lockMine(tx, actor, orderId);
    expectStatus(order.status, ['out_for_delivery'], 'Cette course n’est pas en route.');
    await tx.query(
      `UPDATE online_orders
          SET status = 'ready', dispatched_at = NULL, delivery_issue = $1
        WHERE id = $2`,
      [issue, orderId],
    );
    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { permission: 'orders.manage' },
        exceptUserId: actor.userId,
        kind: 'order.delivery_issue',
        title: 'Problème de livraison',
        body: `${order.reference} · ${order.customer_name} : « ${issue} »`,
        route: 'orders',
        entityId: orderId,
        actorName: actor.userName,
      },
      tx,
    );
    return loadOrder(actor.restaurantId, orderId, tx);
  });
}
