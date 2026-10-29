import type { QueryResultRow } from 'pg';
import { badRequest, conflict, notFound, unprocessable } from '../../core/errors';
import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2 } from '../../utils/money';
import { recordMovement, reverseMovements, type PaymentMethod } from '../cash/cash.service';
import { resolveOrCreateCustomer } from '../customers/customers.service';
import { notify } from '../notifications/notifications.service';
import type { CreateSaleInput, ListSalesInput } from './sales.schemas';

export interface SaleItemView {
  id: string;
  dishId: string | null;
  dishName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  reference: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  soldAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdByName: string | null;
  items?: SaleItemView[];
  credit?: {
    id: string;
    amountDue: number;
    amountPaid: number;
    amountLeft: number;
    status: string;
    dueDate: string | null;
  } | null;
}

interface SaleRow {
  id: string;
  reference: string;
  total_amount: number;
  payment_method: string;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  sold_at: Date;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_by_name: string | null;
}

const toSale = (row: SaleRow): Sale => ({
  id: row.id,
  reference: row.reference,
  totalAmount: row.total_amount,
  paymentMethod: row.payment_method,
  status: row.status,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  note: row.note,
  soldAt: row.sold_at.toISOString(),
  cancelledAt: row.cancelled_at?.toISOString() ?? null,
  cancelReason: row.cancel_reason,
  createdByName: row.created_by_name,
});

const SALE_SELECT = `
  SELECT s.id, s.reference, s.total_amount, s.payment_method, s.status,
         s.customer_id, cu.full_name AS customer_name, cu.phone AS customer_phone,
         s.note, s.sold_at, s.cancelled_at, s.cancel_reason,
         u.full_name AS created_by_name
    FROM sales s
    LEFT JOIN customers cu ON cu.id = s.customer_id
    LEFT JOIN users u      ON u.id = s.created_by`;

/**
 * §8 — Enregistrement d'une vente.
 *
 * Tout se joue dans une seule transaction :
 *   • encaissée (espèces / mobile money / carte) → la caisse est créditée ;
 *   • à crédit → une créance est ouverte, la caisse n'est PAS touchée.
 */
export async function createSale(
  restaurantId: string,
  userId: string,
  input: CreateSaleInput,
): Promise<Sale> {
  return withTransaction(async (tx) => {
    // 1. Chargement des plats — un plat d'un autre restaurant est impossible.
    //    `FOR UPDATE` sérialise deux ventes simultanées du même plat : sans
    //    lui, les deux liraient « il reste 1 portion » et la vendraient.
    const dishIds = [...new Set(input.items.map((item) => item.dishId))];
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
         ORDER BY id
         FOR UPDATE`,
      [restaurantId, dishIds],
    );

    const byId = new Map(dishes.map((dish) => [dish.id, dish]));
    // Quantités cumulées : le même plat peut apparaître sur deux lignes.
    const requested = new Map<string, number>();
    for (const item of input.items) {
      requested.set(item.dishId, (requested.get(item.dishId) ?? 0) + item.quantity);
    }

    for (const id of dishIds) {
      const dish = byId.get(id);
      if (!dish) throw notFound(`Plat ${id}`);
      if (dish.is_archived) throw unprocessable(`Le plat « ${dish.name} » n’est plus au menu.`);
      if (!dish.is_available) {
        throw unprocessable(`Le plat « ${dish.name} » est marqué en rupture.`);
      }

      // §5 — Portions comptées : on ne vend pas ce qui n'a pas été préparé.
      const remaining = dish.available_quantity;
      const wanted = requested.get(id) ?? 0;
      if (remaining !== null && wanted > remaining) {
        throw unprocessable(
          remaining === 0
            ? `Il ne reste aucune portion de « ${dish.name} ».`
            : `Il ne reste que ${remaining} portion(s) de « ${dish.name} ».`,
        );
      }
    }

    // 2. Calcul automatique du total (§8).
    const lines = input.items.map((item) => {
      const dish = byId.get(item.dishId)!;
      const unitPrice = round2(item.unitPrice ?? dish.price);
      return {
        dishId: dish.id,
        dishName: dish.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal: round2(unitPrice * item.quantity),
      };
    });
    const totalAmount = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));

    if (input.paymentMethod === 'credit' && totalAmount <= 0) {
      throw badRequest('Une vente à crédit doit avoir un montant supérieur à zéro.');
    }

    // 3. Client — une fiche existante, jamais un nom saisi à la volée (§8).
    let customerId: string | null = null;
    if (input.customerId) {
      customerId = await resolveOrCreateCustomer(tx, restaurantId, {
        customerId: input.customerId,
      });
    }

    // 4 et 5. Ticket, lignes (nom et prix figés) et encaissement.
    const soldAt = input.soldAt ?? new Date();
    const sale = await insertSaleRecord(tx, {
      restaurantId,
      userId,
      lines,
      totalAmount,
      paymentMethod: input.paymentMethod,
      customerId,
      note: input.note ?? null,
      soldAt,
    });

    // 5 bis. Décompte des portions (§5). Le plat qui tombe à zéro sort de la
    // carte dans la foulée : la caisse le refuserait de toute façon, autant
    // qu'il disparaisse tout de suite de l'écran de vente.
    for (const [dishId, quantity] of requested) {
      if (byId.get(dishId)?.available_quantity === null) continue;
      await tx.query(
        `UPDATE dishes
            SET available_quantity = available_quantity - $1,
                is_available       = (available_quantity - $1) > 0
          WHERE id = $2 AND restaurant_id = $3`,
        [quantity, dishId, restaurantId],
      );
    }

    if (input.paymentMethod === 'credit') {
      // 6. Créance ouverte : aucun mouvement de caisse (§8).
      await tx.query(
        `INSERT INTO credits
           (restaurant_id, sale_id, customer_id, amount_due, due_date, opened_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [restaurantId, sale.id, customerId, totalAmount, input.dueDate ?? null, soldAt],
      );
    }

    return loadSale(restaurantId, sale.id, tx.query.bind(tx));
  });
}

export interface SaleLine {
  dishId: string | null;
  dishName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/**
 * Écrit la vente, ses lignes et, si elle est encaissée, l'entrée en
 * caisse. Les contrôles (plats, portions, client) restent à l'appelant :
 * la caisse les fait au comptoir, la commande en ligne à l'acceptation.
 */
export async function insertSaleRecord(
  tx: Tx,
  params: {
    restaurantId: string;
    userId: string;
    lines: SaleLine[];
    totalAmount: number;
    paymentMethod: string;
    customerId: string | null;
    note: string | null;
    soldAt: Date;
    /** Le serveur de la table, pour les ventes en salle. */
    servedBy?: string | null;
  },
): Promise<{ id: string; reference: string }> {
  const { restaurantId, userId, lines, totalAmount, paymentMethod, soldAt } = params;

  // Numéro de ticket lisible.
  const refRow = await tx.queryOne<{ reference: string }>(
    `SELECT next_document_reference($1, 'sale', 'V', $2::date) AS reference`,
    [restaurantId, soldAt.toISOString().slice(0, 10)],
  );
  const reference = refRow?.reference ?? `V-${Date.now()}`;

  const status = paymentMethod === 'credit' ? 'credit' : 'paid';

  const sale = await tx.queryOne<{ id: string }>(
    `INSERT INTO sales
       (restaurant_id, reference, total_amount, payment_method, status,
        customer_id, note, sold_at, created_by, served_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      restaurantId,
      reference,
      totalAmount,
      paymentMethod,
      status,
      params.customerId,
      params.note,
      soldAt,
      userId,
      params.servedBy ?? null,
    ],
  );
  if (!sale) throw new Error('Création de la vente impossible.');

  for (const line of lines) {
    await tx.query(
      `INSERT INTO sale_items
         (restaurant_id, sale_id, dish_id, dish_name, unit_price, quantity, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [restaurantId, sale.id, line.dishId, line.dishName, line.unitPrice, line.quantity, line.lineTotal],
    );
  }

  // Vente encaissée : + Caisse (§7, §10).
  if (status === 'paid' && totalAmount > 0) {
    await recordMovement(tx, {
      restaurantId,
      direction: 'in',
      amount: totalAmount,
      category: 'sale',
      label: `Vente ${reference}`,
      sourceType: 'sale',
      sourceId: sale.id,
      paymentMethod: paymentMethod as PaymentMethod,
      occurredAt: soldAt,
      createdBy: userId,
    });
  }

  return { id: sale.id, reference };
}

type Querier = <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;

async function loadSale(
  restaurantId: string,
  saleId: string,
  runner: Querier = query as Querier,
): Promise<Sale> {
  const rows = await runner<SaleRow>(`${SALE_SELECT} WHERE s.id = $1 AND s.restaurant_id = $2`, [
    saleId,
    restaurantId,
  ]);
  const row = rows[0];
  if (!row) throw notFound('Vente');

  const items = await runner<{
    id: string;
    dish_id: string | null;
    dish_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>(
    `SELECT id, dish_id, dish_name, unit_price, quantity, line_total
       FROM sale_items WHERE sale_id = $1 ORDER BY dish_name`,
    [saleId],
  );

  const creditRows = await runner<{
    id: string;
    amount_due: number;
    amount_paid: number;
    amount_left: number;
    status: string;
    due_date: string | null;
  }>(
    `SELECT id, amount_due, amount_paid, amount_left, status, due_date
       FROM credits WHERE sale_id = $1`,
    [saleId],
  );
  const credit = creditRows[0];

  return {
    ...toSale(row),
    items: items.map((item) => ({
      id: item.id,
      dishId: item.dish_id,
      dishName: item.dish_name,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      lineTotal: item.line_total,
    })),
    credit: credit
      ? {
          id: credit.id,
          amountDue: credit.amount_due,
          amountPaid: credit.amount_paid,
          amountLeft: credit.amount_left,
          status: credit.status,
          dueDate: credit.due_date,
        }
      : null,
  };
}

export async function getSale(restaurantId: string, saleId: string): Promise<Sale> {
  return loadSale(restaurantId, saleId);
}

/**
 * Le caissier ne consulte que ses propres ventes. Une vente d'un collègue
 * lui répond « introuvable » : il n'a pas à savoir qu'elle existe.
 */
export async function assertSaleAuthor(
  restaurantId: string,
  saleId: string,
  userId: string,
): Promise<void> {
  const row = await queryOne(
    'SELECT 1 FROM sales WHERE id = $1 AND restaurant_id = $2 AND created_by = $3',
    [saleId, restaurantId, userId],
  );
  if (!row) throw notFound('Vente');
}

export async function listSales(
  restaurantId: string,
  input: ListSalesInput,
  /** Restreint la liste et les totaux aux ventes de ce compte. */
  createdBy?: string,
): Promise<Paginated<Sale> & { totals: { amount: number; cashed: number; credit: number } }> {
  const conditions = ['s.restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (createdBy) {
    params.push(createdBy);
    conditions.push(`s.created_by = $${params.length}`);
  }

  if (input.paymentMethod) {
    params.push(input.paymentMethod);
    conditions.push(`s.payment_method = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    conditions.push(`s.status = $${params.length}`);
  }
  if (input.customerId) {
    params.push(input.customerId);
    conditions.push(`s.customer_id = $${params.length}`);
  }
  if (input.from) {
    params.push(input.from);
    conditions.push(`s.sold_at >= $${params.length}::date`);
  }
  if (input.to) {
    params.push(input.to);
    conditions.push(`s.sold_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const summary = await queryOne<{
    count: number;
    amount: number;
    cashed: number;
    credit: number;
  }>(
    `SELECT count(*)::int AS count,
            COALESCE(sum(s.total_amount) FILTER (WHERE s.status <> 'cancelled'), 0) AS amount,
            COALESCE(sum(s.total_amount) FILTER (WHERE s.status = 'paid'), 0)       AS cashed,
            COALESCE(sum(s.total_amount) FILTER (WHERE s.status = 'credit'), 0)     AS credit
       FROM sales s ${where}`,
    params,
  );

  params.push(input.limit, offsetOf(input));
  const rows = await query<SaleRow>(
    `${SALE_SELECT} ${where}
      ORDER BY s.sold_at DESC, s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    ...paginate(rows.map(toSale), summary?.count ?? 0, input),
    totals: {
      amount: summary?.amount ?? 0,
      cashed: summary?.cashed ?? 0,
      credit: summary?.credit ?? 0,
    },
  };
}

/**
 * Annulation d'une vente : les écritures de caisse sont contre-passées,
 * jamais effacées. Une vente à crédit déjà partiellement remboursée ne peut
 * pas être annulée — il faut d'abord traiter les remboursements.
 */
export async function cancelSale(
  restaurantId: string,
  saleId: string,
  userId: string,
  reason: string,
  actorName?: string,
): Promise<Sale> {
  await withTransaction(async (tx) => {
    const sale = await tx.queryOne<{
      id: string;
      reference: string;
      status: string;
      total_amount: number;
      created_by: string | null;
    }>(
      `SELECT id, reference, status, total_amount, created_by FROM sales
        WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [saleId, restaurantId],
    );
    if (!sale) throw notFound('Vente');
    if (sale.status === 'cancelled') throw conflict('Cette vente est déjà annulée.');

    if (sale.status === 'credit') {
      const credit = await tx.queryOne<{ id: string; amount_paid: number }>(
        'SELECT id, amount_paid FROM credits WHERE sale_id = $1',
        [saleId],
      );
      if (credit && credit.amount_paid > 0) {
        throw conflict(
          'Cette vente à crédit a déjà reçu un remboursement. Annulez d’abord les remboursements.',
        );
      }
      if (credit) {
        await tx.query(`UPDATE credits SET status = 'cancelled' WHERE id = $1`, [credit.id]);
      }
    } else {
      await reverseMovements(tx, {
        restaurantId,
        sourceType: 'sale',
        sourceId: saleId,
        label: `Annulation vente ${sale.reference} — ${reason}`,
        createdBy: userId,
      });
    }

    // Les portions retournent au plat : la commande annulée n'a pas été
    // servie. Un plat qui repasse au-dessus de zéro revient à la carte.
    await tx.query(
      `UPDATE dishes d
          SET available_quantity = d.available_quantity + line.quantity,
              is_available       = true
         FROM (SELECT dish_id, sum(quantity)::int AS quantity
                 FROM sale_items
                WHERE sale_id = $1 AND dish_id IS NOT NULL
                GROUP BY dish_id) AS line
        WHERE d.id = line.dish_id
          AND d.restaurant_id = $2
          AND d.available_quantity IS NOT NULL
          AND NOT d.is_archived`,
      [saleId, restaurantId],
    );

    await tx.query(
      `UPDATE sales SET status = 'cancelled', cancelled_at = now(), cancel_reason = $1
        WHERE id = $2 AND restaurant_id = $3`,
      [reason, saleId, restaurantId],
    );

    // Le caissier apprend que son ticket a été annulé, et pourquoi.
    await notify(
      {
        restaurantId,
        to: { userIds: [sale.created_by] },
        exceptUserId: userId,
        kind: 'sale.cancelled',
        title: 'Une de vos ventes a été annulée',
        body: `${sale.reference} : « ${reason} »`,
        route: 'sales',
        entityId: saleId,
        actorName: actorName ?? null,
      },
      tx,
    );
  });

  return getSale(restaurantId, saleId);
}

/** Données du ticket : en-tête restaurant (§3) + lignes de la vente. */
export async function getReceipt(restaurantId: string, saleId: string) {
  const restaurant = await queryOne<{
    name: string;
    address: string | null;
    phone: string | null;
    logo_media_id: string | null;
    currency_symbol: string;
    currency_decimals: number;
  }>(
    'SELECT name, address, phone, logo_media_id, currency_symbol, currency_decimals FROM restaurants WHERE id = $1',
    [restaurantId],
  );
  if (!restaurant) throw notFound('Restaurant');

  const sale = await loadSale(restaurantId, saleId);

  return {
    restaurant: {
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
      logoUrl: restaurant.logo_media_id ? `/api/media/${restaurant.logo_media_id}` : null,
      currencySymbol: restaurant.currency_symbol,
      currencyDecimals: restaurant.currency_decimals,
    },
    sale,
  };
}

/** Palmarès des plats les plus vendus, sur une période. */
export async function topDishes(
  restaurantId: string,
  from?: string,
  to?: string,
  limit = 10,
): Promise<Array<{ dishName: string; quantity: number; revenue: number }>> {
  const conditions = ['si.restaurant_id = $1', "s.status <> 'cancelled'"];
  const params: unknown[] = [restaurantId];

  if (from) {
    params.push(from);
    conditions.push(`s.sold_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`s.sold_at < ($${params.length}::date + interval '1 day')`);
  }
  params.push(limit);

  return query(
    `SELECT si.dish_name AS "dishName",
            sum(si.quantity)   AS quantity,
            sum(si.line_total) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY si.dish_name
      ORDER BY revenue DESC
      LIMIT $${params.length}`,
    params,
  );
}
