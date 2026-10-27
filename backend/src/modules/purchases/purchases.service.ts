import { conflict, forbidden, notFound, unprocessable } from '../../core/errors';
import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2, round3 } from '../../utils/money';
import { insertExpense } from '../expenses/expenses.service';
import { notify } from '../notifications/notifications.service';
import type {
  ApprovePurchaseInput,
  CompletePurchaseInput,
  CreatePurchaseRequestInput,
  ListPurchasesInput,
} from './purchases.schemas';

export type PurchaseStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export interface PurchaseRequest {
  id: string;
  reference: string;
  stockItemId: string | null;
  itemName: string;
  unit: string | null;
  quantity: number;
  estimatedAmount: number;
  approvedAmount: number | null;
  reason: string | null;
  status: PurchaseStatus;
  decisionNote: string | null;
  requestedById: string | null;
  requestedByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  completedByName: string | null;
  completedAt: string | null;
  expenseId: string | null;
  expenseReference: string | null;
  paidAmount: number | null;
  createdAt: string;
}

interface PurchaseRow {
  id: string;
  reference: string;
  stock_item_id: string | null;
  item_name: string;
  unit: string | null;
  quantity: number;
  estimated_amount: number;
  approved_amount: number | null;
  reason: string | null;
  status: PurchaseStatus;
  decision_note: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  decided_by_name: string | null;
  decided_at: Date | null;
  completed_by_name: string | null;
  completed_at: Date | null;
  expense_id: string | null;
  expense_reference: string | null;
  paid_amount: number | null;
  created_at: Date;
}

const toPurchase = (row: PurchaseRow): PurchaseRequest => ({
  id: row.id,
  reference: row.reference,
  stockItemId: row.stock_item_id,
  itemName: row.item_name,
  unit: row.unit,
  quantity: row.quantity,
  estimatedAmount: row.estimated_amount,
  approvedAmount: row.approved_amount,
  reason: row.reason,
  status: row.status,
  decisionNote: row.decision_note,
  requestedById: row.requested_by,
  requestedByName: row.requested_by_name,
  decidedByName: row.decided_by_name,
  decidedAt: row.decided_at?.toISOString() ?? null,
  completedByName: row.completed_by_name,
  completedAt: row.completed_at?.toISOString() ?? null,
  expenseId: row.expense_id,
  expenseReference: row.expense_reference,
  paidAmount: row.paid_amount,
  createdAt: row.created_at.toISOString(),
});

const SELECT = `
  SELECT p.id, p.reference, p.stock_item_id, p.item_name, p.unit, p.quantity,
         p.estimated_amount, p.approved_amount, p.reason, p.status, p.decision_note,
         p.requested_by, req.full_name AS requested_by_name,
         dec.full_name AS decided_by_name, p.decided_at,
         com.full_name AS completed_by_name, p.completed_at,
         p.expense_id, e.reference AS expense_reference, e.amount AS paid_amount,
         p.created_at
    FROM purchase_requests p
    LEFT JOIN users req   ON req.id = p.requested_by
    LEFT JOIN users dec   ON dec.id = p.decided_by
    LEFT JOIN users com   ON com.id = p.completed_by
    LEFT JOIN expenses e  ON e.id = p.expense_id`;

interface Actor {
  restaurantId: string;
  userId: string;
  userName: string;
  /** Peut approuver, voir toutes les demandes et effectuer n'importe quel achat. */
  isApprover: boolean;
}

const quantityLabel = (quantity: number, unit: string | null) =>
  `${round3(quantity)}${unit ? ` ${unit}` : ''}`;

export async function createRequest(
  actor: Actor,
  input: CreatePurchaseRequestInput,
): Promise<PurchaseRequest> {
  const id = await withTransaction(async (tx) => {
    let itemName = input.itemName ?? '';
    let unit: string | null = input.unit ?? null;

    if (input.stockItemId) {
      const item = await tx.queryOne<{ name: string; unit: string }>(
        'SELECT name, unit FROM stock_items WHERE id = $1 AND restaurant_id = $2 AND NOT is_archived',
        [input.stockItemId, actor.restaurantId],
      );
      if (!item) throw notFound('Produit en stock');
      itemName = item.name;
      unit = item.unit;
    }

    const refRow = await tx.queryOne<{ reference: string }>(
      `SELECT next_document_reference($1, 'purchase', 'DA') AS reference`,
      [actor.restaurantId],
    );

    const row = await tx.queryOne<{ id: string }>(
      `INSERT INTO purchase_requests
         (restaurant_id, reference, stock_item_id, item_name, unit, quantity,
          estimated_amount, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        actor.restaurantId,
        refRow?.reference ?? `DA-${Date.now()}`,
        input.stockItemId ?? null,
        itemName,
        unit,
        round3(input.quantity),
        round2(input.estimatedAmount),
        input.reason ?? null,
        actor.userId,
      ],
    );
    if (!row) throw new Error('Création de la demande impossible.');

    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { permission: 'purchases.approve' },
        exceptUserId: actor.userId,
        kind: 'purchase.requested',
        title: 'Nouvelle demande d’achat',
        body: `${actor.userName} demande ${quantityLabel(input.quantity, unit)} de ${itemName}.`,
        route: 'purchases',
        entityId: row.id,
        actorName: actor.userName,
      },
      tx,
    );

    return row.id;
  });

  return getRequest(actor, id);
}

export async function getRequest(actor: Actor, id: string): Promise<PurchaseRequest> {
  const row = await queryOne<PurchaseRow>(`${SELECT} WHERE p.id = $1 AND p.restaurant_id = $2`, [
    id,
    actor.restaurantId,
  ]);
  // Le magasinier ne voit que ses demandes : celle d'un collègue n'existe pas pour lui.
  if (!row || (!actor.isApprover && row.requested_by !== actor.userId)) {
    throw notFound('Demande d’achat');
  }
  return toPurchase(row);
}

export async function listRequests(
  actor: Actor,
  input: ListPurchasesInput,
): Promise<Paginated<PurchaseRequest> & { pendingCount: number; approvedCount: number }> {
  const conditions = ['p.restaurant_id = $1'];
  const params: unknown[] = [actor.restaurantId];

  if (!actor.isApprover) {
    params.push(actor.userId);
    conditions.push(`p.requested_by = $${params.length}`);
  }
  const scope = conditions.join(' AND ');
  const scopeParams = [...params];

  if (input.status) {
    params.push(input.status);
    conditions.push(`p.status = $${params.length}`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const [total, counts] = await Promise.all([
    queryOne<{ count: number }>(`SELECT count(*)::int AS count FROM purchase_requests p ${where}`, params),
    queryOne<{ pending: number; approved: number }>(
      `SELECT count(*) FILTER (WHERE p.status = 'pending')::int  AS pending,
              count(*) FILTER (WHERE p.status = 'approved')::int AS approved
         FROM purchase_requests p WHERE ${scope}`,
      scopeParams,
    ),
  ]);

  params.push(input.limit, offsetOf(input));
  const rows = await query<PurchaseRow>(
    `${SELECT} ${where}
      ORDER BY (p.status IN ('pending', 'approved')) DESC, p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    ...paginate(rows.map(toPurchase), total?.count ?? 0, input),
    pendingCount: counts?.pending ?? 0,
    approvedCount: counts?.approved ?? 0,
  };
}

/** Verrouille la demande et vérifie son état avant de la faire avancer. */
async function lockRequest(
  tx: Tx,
  actor: Actor,
  id: string,
  expected: PurchaseStatus[],
): Promise<{
  status: PurchaseStatus;
  requested_by: string | null;
  reference: string;
  item_name: string;
  unit: string | null;
  quantity: number;
  estimated_amount: number;
  approved_amount: number | null;
  stock_item_id: string | null;
}> {
  const row = await tx.queryOne<{
    status: PurchaseStatus;
    requested_by: string | null;
    reference: string;
    item_name: string;
    unit: string | null;
    quantity: number;
    estimated_amount: number;
    approved_amount: number | null;
    stock_item_id: string | null;
  }>(
    `SELECT status, requested_by, reference, item_name, unit, quantity,
            estimated_amount, approved_amount, stock_item_id
       FROM purchase_requests WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
    [id, actor.restaurantId],
  );
  if (!row || (!actor.isApprover && row.requested_by !== actor.userId)) {
    throw notFound('Demande d’achat');
  }
  if (!expected.includes(row.status)) {
    throw conflict(STATUS_CONFLICTS[row.status]);
  }
  return row;
}

const STATUS_CONFLICTS: Record<PurchaseStatus, string> = {
  pending: 'Cette demande attend encore la décision du gérant.',
  approved: 'Cette demande a déjà été approuvée.',
  rejected: 'Cette demande a été refusée.',
  completed: 'Cet achat a déjà été effectué.',
  cancelled: 'Cette demande a été annulée.',
};

export async function approveRequest(
  actor: Actor,
  id: string,
  input: ApprovePurchaseInput,
): Promise<PurchaseRequest> {
  await withTransaction(async (tx) => {
    const request = await lockRequest(tx, actor, id, ['pending']);
    const approvedAmount = round2(input.approvedAmount ?? request.estimated_amount);

    await tx.query(
      `UPDATE purchase_requests
          SET status = 'approved', approved_amount = $1, decision_note = $2,
              decided_by = $3, decided_at = now()
        WHERE id = $4`,
      [approvedAmount, input.note ?? null, actor.userId, id],
    );

    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { userIds: [request.requested_by] },
        exceptUserId: actor.userId,
        kind: 'purchase.approved',
        title: 'Demande d’achat approuvée',
        body: `${request.reference} · ${request.item_name} : vous pouvez acheter, dans la limite du montant accordé.${
          input.note ? ` « ${input.note} »` : ''
        }`,
        route: 'purchases',
        entityId: id,
        actorName: actor.userName,
      },
      tx,
    );
  });
  return getRequest(actor, id);
}

export async function rejectRequest(actor: Actor, id: string, note: string): Promise<PurchaseRequest> {
  await withTransaction(async (tx) => {
    const request = await lockRequest(tx, actor, id, ['pending']);

    await tx.query(
      `UPDATE purchase_requests
          SET status = 'rejected', decision_note = $1, decided_by = $2, decided_at = now()
        WHERE id = $3`,
      [note, actor.userId, id],
    );

    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { userIds: [request.requested_by] },
        exceptUserId: actor.userId,
        kind: 'purchase.rejected',
        title: 'Demande d’achat refusée',
        body: `${request.reference} · ${request.item_name} : « ${note} »`,
        route: 'purchases',
        entityId: id,
        actorName: actor.userName,
      },
      tx,
    );
  });
  return getRequest(actor, id);
}

/**
 * Achat effectué : la dépense est enregistrée (− Caisse, + Stock) dans la
 * même transaction que la clôture de la demande. Le montant payé ne peut
 * pas dépasser ce que le gérant a accordé.
 */
export async function completeRequest(
  actor: Actor,
  id: string,
  input: CompletePurchaseInput,
): Promise<PurchaseRequest> {
  await withTransaction(async (tx) => {
    const request = await lockRequest(tx, actor, id, ['approved']);
    const amount = round2(input.amount);
    const ceiling = request.approved_amount ?? 0;

    if (amount > ceiling) {
      throw unprocessable(
        `Le montant payé dépasse le montant approuvé (${ceiling}). Faites une nouvelle demande pour la différence.`,
      );
    }

    // Produit nouveau : sa fiche naît maintenant, à quantité nulle — c'est
    // la dépense qui y fait entrer la marchandise, au prix réellement payé.
    let stockItemId = request.stock_item_id;
    if (!stockItemId) {
      const created = await tx.queryOne<{ id: string }>(
        `INSERT INTO stock_items (restaurant_id, name, unit) VALUES ($1, $2, $3) RETURNING id`,
        [actor.restaurantId, request.item_name, request.unit ?? 'piece'],
      );
      if (!created) throw new Error('Création du produit impossible.');
      stockItemId = created.id;
    }

    const quantity = input.quantity ?? request.quantity;
    const expenseId = await insertExpense(tx, {
      restaurantId: actor.restaurantId,
      userId: actor.userId,
      amount,
      category: 'stock_purchase',
      description: `${request.reference} — ${request.item_name}${input.note ? ` (${input.note})` : ''}`,
      expenseDate: new Date().toISOString().slice(0, 10),
      paymentMethod: input.paymentMethod,
      stockItemId,
      quantity,
    });

    await tx.query(
      `UPDATE purchase_requests
          SET status = 'completed', expense_id = $1, stock_item_id = $2,
              completed_by = $3, completed_at = now()
        WHERE id = $4`,
      [expenseId, stockItemId, actor.userId, id],
    );

    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { permission: 'purchases.approve', userIds: [request.requested_by] },
        exceptUserId: actor.userId,
        kind: 'purchase.completed',
        title: 'Achat effectué',
        body: `${actor.userName} a acheté ${quantityLabel(quantity, request.unit)} de ${request.item_name} (${request.reference}).`,
        route: 'purchases',
        entityId: id,
        actorName: actor.userName,
      },
      tx,
    );
  });
  return getRequest(actor, id);
}

/** Le demandeur retire sa demande tant que l'achat n'est pas fait. */
export async function cancelRequest(
  actor: Actor,
  id: string,
  note: string | undefined,
): Promise<PurchaseRequest> {
  await withTransaction(async (tx) => {
    const request = await lockRequest(tx, actor, id, ['pending', 'approved']);
    if (request.requested_by !== actor.userId && !actor.isApprover) {
      throw forbidden('Seul le demandeur ou le gérant peut annuler cette demande.');
    }
    await tx.query(
      `UPDATE purchase_requests SET status = 'cancelled', decision_note = COALESCE($1, decision_note)
        WHERE id = $2`,
      [note ?? null, id],
    );
  });
  return getRequest(actor, id);
}
