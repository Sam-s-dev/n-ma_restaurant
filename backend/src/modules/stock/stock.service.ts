import { conflict, notFound, unprocessable } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2, round3 } from '../../utils/money';
import type {
  AdjustStockInput,
  CreateStockItemInput,
  ListStockInput,
  UpdateStockItemInput,
} from './stock.schemas';

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  purchasePrice: number;
  alertThreshold: number;
  stockValue: number;
  isLow: boolean;
  isArchived: boolean;
}

interface StockRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  purchase_price: number;
  alert_threshold: number;
  is_archived: boolean;
}

const toItem = (row: StockRow): StockItem => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  quantity: row.quantity,
  purchasePrice: row.purchase_price,
  alertThreshold: row.alert_threshold,
  stockValue: round2(row.quantity * row.purchase_price),
  isLow: row.quantity <= row.alert_threshold,
  isArchived: row.is_archived,
});

const SELECT = `
  SELECT id, name, unit, quantity, purchase_price, alert_threshold, is_archived
    FROM stock_items`;

export async function listItems(
  restaurantId: string,
  input: ListStockInput,
): Promise<{ items: StockItem[]; summary: { totalValue: number; lowCount: number } }> {
  const conditions = ['restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (!input.includeArchived) conditions.push('NOT is_archived');
  if (input.onlyLow) conditions.push('quantity <= alert_threshold');
  if (input.search) {
    params.push(`%${input.search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }

  const rows = await query<StockRow>(
    `${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY name`,
    params,
  );

  const items = rows.map(toItem);
  return {
    items,
    summary: {
      totalValue: round2(items.reduce((sum, item) => sum + item.stockValue, 0)),
      lowCount: items.filter((item) => item.isLow).length,
    },
  };
}

export async function getItem(restaurantId: string, id: string): Promise<StockItem> {
  const row = await queryOne<StockRow>(`${SELECT} WHERE id = $1 AND restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Produit');
  return toItem(row);
}

export async function createItem(
  restaurantId: string,
  userId: string,
  input: CreateStockItemInput,
): Promise<StockItem> {
  return withTransaction(async (tx) => {
    const row = await tx.queryOne<StockRow>(
      `INSERT INTO stock_items (restaurant_id, name, unit, quantity, purchase_price, alert_threshold)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, unit, quantity, purchase_price, alert_threshold, is_archived`,
      [
        restaurantId,
        input.name,
        input.unit,
        round3(input.quantity),
        round2(input.purchasePrice),
        round3(input.alertThreshold),
      ],
    );
    if (!row) throw new Error('Création du produit impossible.');

    // Le stock initial déclaré à la création est tracé, mais n'impacte pas
    // la caisse : il n'y a pas eu d'achat aujourd'hui (§6).
    if (input.quantity > 0) {
      await tx.query(
        `INSERT INTO stock_movements
           (restaurant_id, stock_item_id, direction, quantity, unit_price, reason,
            source_type, quantity_after, note, created_by)
         VALUES ($1, $2, 'in', $3, $4, 'initial', 'manual', $3, 'Stock initial', $5)`,
        [restaurantId, row.id, round3(input.quantity), round2(input.purchasePrice), userId],
      );
    }

    return toItem(row);
  });
}

export async function updateItem(
  restaurantId: string,
  id: string,
  input: UpdateStockItemInput,
): Promise<StockItem> {
  const payload = {
    ...input,
    ...(input.purchasePrice !== undefined ? { purchasePrice: round2(input.purchasePrice) } : {}),
    ...(input.alertThreshold !== undefined ? { alertThreshold: round3(input.alertThreshold) } : {}),
  };

  const { setClause, values, nextIndex } = buildUpdate(payload, {
    name: 'name',
    unit: 'unit',
    purchasePrice: 'purchase_price',
    alertThreshold: 'alert_threshold',
  });

  const row = await queryOne<StockRow>(
    `UPDATE stock_items SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1}
      RETURNING id, name, unit, quantity, purchase_price, alert_threshold, is_archived`,
    [...values, id, restaurantId],
  );
  if (!row) throw notFound('Produit');
  return toItem(row);
}

/**
 * Applique une variation de stock et journalise le mouvement.
 * Le SELECT ... FOR UPDATE sérialise deux achats simultanés du même produit.
 */
export async function applyStockChange(
  tx: Tx,
  params: {
    restaurantId: string;
    stockItemId: string;
    direction: 'in' | 'out';
    quantity: number;
    unitPrice?: number | null;
    reason: 'purchase' | 'initial' | 'adjustment' | 'loss';
    sourceType?: 'expense' | 'manual';
    sourceId?: string | null;
    note?: string | null;
    createdBy?: string | null;
  },
): Promise<{ quantityAfter: number; name: string; unit: string }> {
  const current = await tx.queryOne<{ quantity: number; name: string; unit: string }>(
    `SELECT quantity, name, unit FROM stock_items
      WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
    [params.stockItemId, params.restaurantId],
  );
  if (!current) throw notFound('Produit en stock');

  const delta = params.direction === 'in' ? params.quantity : -params.quantity;
  const quantityAfter = round3(current.quantity + delta);

  if (quantityAfter < 0) {
    throw unprocessable(
      `Stock insuffisant pour « ${current.name} » : ${current.quantity} ${current.unit} disponible(s).`,
    );
  }

  await tx.query(
    `UPDATE stock_items
        SET quantity = $1,
            purchase_price = CASE WHEN $2::numeric IS NOT NULL AND $3 = 'purchase'
                                  THEN $2::numeric ELSE purchase_price END
      WHERE id = $4 AND restaurant_id = $5`,
    [
      quantityAfter,
      params.unitPrice ?? null,
      params.reason,
      params.stockItemId,
      params.restaurantId,
    ],
  );

  await tx.query(
    `INSERT INTO stock_movements
       (restaurant_id, stock_item_id, direction, quantity, unit_price, reason,
        source_type, source_id, quantity_after, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      params.restaurantId,
      params.stockItemId,
      params.direction,
      round3(params.quantity),
      params.unitPrice ?? null,
      params.reason,
      params.sourceType ?? 'manual',
      params.sourceId ?? null,
      quantityAfter,
      params.note ?? null,
      params.createdBy ?? null,
    ],
  );

  return { quantityAfter, name: current.name, unit: current.unit };
}

export async function adjustStock(
  restaurantId: string,
  id: string,
  userId: string,
  input: AdjustStockInput,
): Promise<StockItem> {
  await withTransaction(async (tx) => {
    await applyStockChange(tx, {
      restaurantId,
      stockItemId: id,
      direction: input.direction,
      quantity: input.quantity,
      reason: input.reason,
      sourceType: 'manual',
      note: input.note ?? null,
      createdBy: userId,
    });
  });
  return getItem(restaurantId, id);
}

export interface StockMovementView {
  id: string;
  direction: 'in' | 'out';
  quantity: number;
  unitPrice: number | null;
  reason: string;
  quantityAfter: number;
  note: string | null;
  occurredAt: string;
  createdByName: string | null;
}

export async function listMovements(
  restaurantId: string,
  stockItemId: string,
  limit = 100,
): Promise<StockMovementView[]> {
  const rows = await query<{
    id: string;
    direction: 'in' | 'out';
    quantity: number;
    unit_price: number | null;
    reason: string;
    quantity_after: number;
    note: string | null;
    occurred_at: Date;
    created_by_name: string | null;
  }>(
    `SELECT m.id, m.direction, m.quantity, m.unit_price, m.reason, m.quantity_after,
            m.note, m.occurred_at, u.full_name AS created_by_name
       FROM stock_movements m
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.restaurant_id = $1 AND m.stock_item_id = $2
      ORDER BY m.occurred_at DESC
      LIMIT $3`,
    [restaurantId, stockItemId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    reason: row.reason,
    quantityAfter: row.quantity_after,
    note: row.note,
    occurredAt: row.occurred_at.toISOString(),
    createdByName: row.created_by_name,
  }));
}

export async function archiveItem(restaurantId: string, id: string): Promise<void> {
  const used = await queryOne<{ count: number }>(
    'SELECT count(*)::int AS count FROM expenses WHERE stock_item_id = $1',
    [id],
  );

  if ((used?.count ?? 0) > 0) {
    const row = await queryOne(
      'UPDATE stock_items SET is_archived = true WHERE id = $1 AND restaurant_id = $2 RETURNING id',
      [id, restaurantId],
    );
    if (!row) throw notFound('Produit');
    return;
  }

  try {
    const row = await queryOne(
      'DELETE FROM stock_items WHERE id = $1 AND restaurant_id = $2 RETURNING id',
      [id, restaurantId],
    );
    if (!row) throw notFound('Produit');
  } catch (error) {
    if ((error as { code?: string }).code === '23503') {
      throw conflict('Ce produit est référencé ailleurs et ne peut pas être supprimé.');
    }
    throw error;
  }
}

/** §6 — produits sous le seuil d'alerte, remontés sur le tableau de bord. */
export async function lowStockAlerts(restaurantId: string): Promise<StockItem[]> {
  const rows = await query<StockRow>(
    `${SELECT} WHERE restaurant_id = $1 AND NOT is_archived AND quantity <= alert_threshold
      ORDER BY (quantity - alert_threshold), name`,
    [restaurantId],
  );
  return rows.map(toItem);
}
