import { conflict, notFound } from '../../core/errors';
import { query } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { notify } from '../notifications/notifications.service';
import { markReady as markOrderReady } from '../orders/orders.service';
import { billName, getKitchenSettings, refreshTicketStatus, type Actor, type ItemStatus } from '../tables/tables.service';

export interface KitchenTicket {
  id: string;
  source: 'table' | 'online';
  /** « Table 5 · Groupe de 4 » ou « Livraison CL-…-0003 ». */
  title: string;
  waiterName: string | null;
  status: 'new' | 'preparing' | 'ready';
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  items: Array<{ id: string; dishName: string; quantity: number; note: string | null; status: ItemStatus }>;
}

/**
 * L'écran cuisine : les tickets à préparer, du plus ancien au plus récent,
 * et ceux prêts depuis peu (le serveur ne les a pas encore emportés).
 *
 * Chaque lecture vérifie aussi les retards : un ticket qui dépasse le seuil
 * prévient le gérant, une seule fois.
 */
export async function listKitchen(restaurantId: string) {
  const settings = await getKitchenSettings(restaurantId);
  await flagLateTickets(restaurantId, settings.lateMinutes);

  const tickets = await query<{
    id: string;
    source: 'table' | 'online';
    status: KitchenTicket['status'];
    created_at: Date;
    started_at: Date | null;
    ready_at: Date | null;
    table_name: string | null;
    bill_label: string | null;
    bill_reference: string | null;
    waiter_name: string | null;
    order_reference: string | null;
    order_mode: string | null;
  }>(
    `SELECT k.id, k.source, k.status, k.created_at, k.started_at, k.ready_at,
            t.name AS table_name, b.label AS bill_label, b.reference AS bill_reference,
            u.full_name AS waiter_name, o.reference AS order_reference, o.mode AS order_mode
       FROM kitchen_tickets k
       LEFT JOIN table_bills b   ON b.id = k.bill_id
       LEFT JOIN dining_tables t ON t.id = b.table_id
       LEFT JOIN users u         ON u.id = k.sent_by
       LEFT JOIN online_orders o ON o.id = k.order_id
      WHERE k.restaurant_id = $1
        AND (k.status IN ('new', 'preparing')
             OR (k.status = 'ready' AND k.ready_at >= now() - interval '30 minutes'))
      ORDER BY k.created_at`,
    [restaurantId],
  );

  const items = tickets.length
    ? await query<{ id: string; ticket_id: string; dish_name: string; quantity: number; note: string | null; status: ItemStatus }>(
        `SELECT id, ticket_id, dish_name, quantity, note, status FROM kitchen_items
          WHERE ticket_id = ANY($1::uuid[]) AND status <> 'cancelled'
          ORDER BY created_at, dish_name`,
        [tickets.map((ticket) => ticket.id)],
      )
    : [];

  return {
    warnMinutes: settings.warnMinutes,
    lateMinutes: settings.lateMinutes,
    serverTime: new Date().toISOString(),
    data: tickets.map<KitchenTicket>((ticket) => ({
      id: ticket.id,
      source: ticket.source,
      title:
        ticket.source === 'table'
          ? billName(ticket.table_name ?? 'Table', ticket.bill_label, ticket.bill_reference ?? '')
          : `${ticket.order_mode === 'pickup' ? 'À emporter' : 'Livraison'} ${ticket.order_reference?.slice(-4) ?? ''}`,
      waiterName: ticket.source === 'table' ? ticket.waiter_name : null,
      status: ticket.status,
      createdAt: ticket.created_at.toISOString(),
      startedAt: ticket.started_at?.toISOString() ?? null,
      readyAt: ticket.ready_at?.toISOString() ?? null,
      items: items
        .filter((item) => item.ticket_id === ticket.id)
        .map((item) => ({
          id: item.id,
          dishName: item.dish_name,
          quantity: item.quantity,
          note: item.note,
          status: item.status,
        })),
    })),
  };
}

async function flagLateTickets(restaurantId: string, lateMinutes: number) {
  const late = await query<{ id: string; created_at: Date }>(
    `UPDATE kitchen_tickets SET late_notified_at = now()
      WHERE restaurant_id = $1 AND status IN ('new', 'preparing') AND late_notified_at IS NULL
        AND created_at < now() - make_interval(mins => $2)
      RETURNING id, created_at`,
    [restaurantId, lateMinutes],
  );
  if (late.length === 0) return;
  await notify({
    restaurantId,
    to: { roles: ['manager'] },
    kind: 'kitchen.late',
    title: late.length > 1 ? `${late.length} tickets en retard en cuisine` : 'Un ticket est en retard en cuisine',
    body: `Ils attendent depuis plus de ${lateMinutes} minutes.`,
    route: 'kitchen',
    entityId: late[0]!.id,
  });
}

interface TicketContext {
  id: string;
  source: 'table' | 'online';
  status: string;
  bill_id: string | null;
  order_id: string | null;
  waiter_id: string | null;
  table_name: string | null;
  bill_label: string | null;
  bill_reference: string | null;
}

async function lockTicket(tx: Tx, restaurantId: string, ticketId: string): Promise<TicketContext> {
  const ticket = await tx.queryOne<TicketContext>(
    `SELECT k.id, k.source, k.status, k.bill_id, k.order_id, b.waiter_id,
            t.name AS table_name, b.label AS bill_label, b.reference AS bill_reference
       FROM kitchen_tickets k
       LEFT JOIN table_bills b   ON b.id = k.bill_id
       LEFT JOIN dining_tables t ON t.id = b.table_id
      WHERE k.id = $1 AND k.restaurant_id = $2
      FOR UPDATE OF k`,
    [ticketId, restaurantId],
  );
  if (!ticket) throw notFound('Ticket');
  return ticket;
}

/** Le cuisinier commence : le serveur voit « en préparation », sans être dérangé. */
export async function startTicket(actor: Actor, ticketId: string) {
  await withTransaction(async (tx) => {
    const ticket = await lockTicket(tx, actor.restaurantId, ticketId);
    if (ticket.status !== 'new') throw conflict('Ce ticket est déjà en préparation.');
    await tx.query(`UPDATE kitchen_items SET status = 'preparing' WHERE ticket_id = $1 AND status = 'sent'`, [ticketId]);
    await tx.query(`UPDATE kitchen_tickets SET status = 'preparing', started_at = now() WHERE id = $1`, [ticketId]);
  });
  return listKitchen(actor.restaurantId);
}

/**
 * Plat prêt (un seul, ou tout le ticket). Le serveur de la table est
 * prévenu ; une commande en ligne entièrement prête passe « prête » chez
 * le caissier et chez son livreur.
 */
export async function markItemsReady(actor: Actor, ticketId: string, itemId?: string) {
  const outcome = await withTransaction(async (tx) => {
    const ticket = await lockTicket(tx, actor.restaurantId, ticketId);
    if (ticket.status === 'cancelled' || ticket.status === 'served') throw conflict('Ce ticket est clos.');

    const updated = await tx.query<{ dish_name: string; quantity: number }>(
      `UPDATE kitchen_items SET status = 'ready', ready_at = now()
        WHERE ticket_id = $1 AND status IN ('sent', 'preparing') ${itemId ? 'AND id = $2' : ''}
        RETURNING dish_name, quantity`,
      itemId ? [ticketId, itemId] : [ticketId],
    );
    if (updated.length === 0) throw conflict(itemId ? 'Ce plat est déjà prêt.' : 'Tout est déjà prêt.');
    const status = await refreshTicketStatus(tx, ticketId);

    if (ticket.source === 'table') {
      const name = billName(ticket.table_name ?? 'Table', ticket.bill_label, ticket.bill_reference ?? '');
      await notify(
        {
          restaurantId: actor.restaurantId,
          to: { userIds: [ticket.waiter_id] },
          exceptUserId: actor.userId,
          kind: 'kitchen.ready',
          title: status === 'ready' ? `Tout est prêt · ${name}` : `Plat prêt · ${name}`,
          body: updated.map((item) => `${item.quantity} ${item.dish_name}`).join(', '),
          route: 'tables',
          entityId: ticket.bill_id,
          actorName: actor.userName,
        },
        tx,
      );
    }
    return { orderId: ticket.source === 'online' && status === 'ready' ? ticket.order_id : null };
  });

  // Hors de la transaction : la commande en ligne a sa propre règle d'étapes.
  if (outcome.orderId) {
    await markOrderReady(actor, outcome.orderId).catch(() => undefined);
  }
  return listKitchen(actor.restaurantId);
}

// ---------------------------------------------------------------------------
// Commandes en ligne : elles passent par le même écran
// ---------------------------------------------------------------------------

/** Appelé quand le caissier accepte une commande en ligne. */
export async function createOnlineTicket(tx: Tx, restaurantId: string, orderId: string, acceptedBy: string) {
  const ticket = await tx.queryOne<{ id: string }>(
    `INSERT INTO kitchen_tickets (restaurant_id, source, order_id, sent_by)
     VALUES ($1, 'online', $2, $3)
     ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [restaurantId, orderId, acceptedBy],
  );
  if (!ticket) return;
  const items = await tx.query<{ dish_id: string | null; dish_name: string; unit_price: number; quantity: number }>(
    `INSERT INTO kitchen_items (restaurant_id, ticket_id, dish_id, dish_name, unit_price, quantity)
     SELECT restaurant_id, $2, dish_id, dish_name, unit_price, quantity
       FROM online_order_items WHERE order_id = $1
     RETURNING dish_id, dish_name, unit_price, quantity`,
    [orderId, ticket.id],
  );
  const order = await tx.queryOne<{ reference: string; mode: string }>(
    'SELECT reference, mode FROM online_orders WHERE id = $1',
    [orderId],
  );
  await notify(
    {
      restaurantId,
      to: { roles: ['cook'] },
      kind: 'kitchen.new',
      title: `Nouveau ticket · ${order?.mode === 'pickup' ? 'À emporter' : 'Livraison'} ${order?.reference.slice(-4) ?? ''}`,
      body: items.map((item) => `${item.quantity} ${item.dish_name}`).join(', ').slice(0, 300),
      route: 'kitchen',
      entityId: ticket.id,
    },
    tx,
  );
}

/** La commande en ligne part, est remise ou annulée : son ticket quitte la cuisine. */
export async function closeOnlineTicket(tx: Tx, orderId: string, status: 'served' | 'cancelled') {
  await tx.query(
    `UPDATE kitchen_items SET status = $2
      WHERE ticket_id IN (SELECT id FROM kitchen_tickets WHERE order_id = $1)
        AND status NOT IN ('served', 'cancelled')`,
    [orderId, status],
  );
  await tx.query(
    `UPDATE kitchen_tickets SET status = $2, ready_at = COALESCE(ready_at, now())
      WHERE order_id = $1 AND status NOT IN ('served', 'cancelled')`,
    [orderId, status],
  );
}
