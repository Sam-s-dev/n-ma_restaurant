import { conflict, notFound, unprocessable } from '../../core/errors';
import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import { withTransaction, type Tx } from '../../db/transaction';
import { round2 } from '../../utils/money';
import { assertCashAvailable, recordMovement } from '../cash/cash.service';
import { notify } from '../notifications/notifications.service';
import type { CloseSessionInput, ListSessionsInput, OpenSessionInput } from './sessions.schemas';

/** Chiffres de la journée, figés à la clôture : c'est le contenu du ticket Z. */
export interface SessionSummary {
  sales: {
    count: number;
    total: number;
    byMethod: Record<string, { count: number; total: number }>;
  };
  cancelledSales: { count: number; total: number };
  creditRepayments: number;
  expenses: number;
  salaries: number;
  capitalIn: number;
  capitalOut: number;
  adjustments: number;
  /** Net encaissé moins décaissé, par mode de paiement. */
  netByMethod: Record<string, number>;
}

export interface CashSession {
  id: string;
  reference: string;
  status: 'open' | 'closed';
  openedByName: string | null;
  openedAt: string;
  openingFloat: number;
  openingBreakdown: Record<string, number> | null;
  closedByName: string | null;
  closedAt: string | null;
  countedCash: number | null;
  countedBreakdown: Record<string, number> | null;
  countedMobileMoney: number | null;
  expectedCash: number | null;
  expectedMobileMoney: number | null;
  cashDifference: number | null;
  mobileMoneyDifference: number | null;
  closeNote: string | null;
  summary: SessionSummary | null;
  correctedByName: string | null;
  correctedAt: string | null;
}

interface SessionRow {
  id: string;
  reference: string;
  status: 'open' | 'closed';
  opened_by_name: string | null;
  opened_at: Date;
  opening_float: number;
  opening_breakdown: Record<string, number> | null;
  closed_by_name: string | null;
  closed_at: Date | null;
  counted_cash: number | null;
  counted_breakdown: Record<string, number> | null;
  counted_mobile_money: number | null;
  expected_cash: number | null;
  expected_mobile_money: number | null;
  cash_difference: number | null;
  mobile_money_difference: number | null;
  close_note: string | null;
  summary: SessionSummary | null;
  corrected_by_name: string | null;
  corrected_at: Date | null;
}

const toSession = (row: SessionRow): CashSession => ({
  id: row.id,
  reference: row.reference,
  status: row.status,
  openedByName: row.opened_by_name,
  openedAt: row.opened_at.toISOString(),
  openingFloat: row.opening_float,
  openingBreakdown: row.opening_breakdown,
  closedByName: row.closed_by_name,
  closedAt: row.closed_at?.toISOString() ?? null,
  countedCash: row.counted_cash,
  countedBreakdown: row.counted_breakdown,
  countedMobileMoney: row.counted_mobile_money,
  expectedCash: row.expected_cash,
  expectedMobileMoney: row.expected_mobile_money,
  cashDifference: row.cash_difference,
  mobileMoneyDifference: row.mobile_money_difference,
  closeNote: row.close_note,
  summary: row.summary,
  correctedByName: row.corrected_by_name,
  correctedAt: row.corrected_at?.toISOString() ?? null,
});

const SELECT = `
  SELECT s.id, s.reference, s.status, op.full_name AS opened_by_name, s.opened_at,
         s.opening_float, s.opening_breakdown, cl.full_name AS closed_by_name, s.closed_at,
         s.counted_cash, s.counted_breakdown, s.counted_mobile_money,
         s.expected_cash, s.expected_mobile_money, s.cash_difference, s.mobile_money_difference,
         s.close_note, s.summary, co.full_name AS corrected_by_name, s.corrected_at
    FROM cash_sessions s
    LEFT JOIN users op ON op.id = s.opened_by
    LEFT JOIN users cl ON cl.id = s.closed_by
    LEFT JOIN users co ON co.id = s.corrected_by`;

interface Actor {
  restaurantId: string;
  userId: string;
  userName: string;
}

export async function getOpenSession(restaurantId: string): Promise<CashSession | null> {
  const row = await queryOne<SessionRow>(
    `${SELECT} WHERE s.restaurant_id = $1 AND s.status = 'open'`,
    [restaurantId],
  );
  return row ? toSession(row) : null;
}

export async function getSession(restaurantId: string, id: string): Promise<CashSession> {
  const row = await queryOne<SessionRow>(`${SELECT} WHERE s.id = $1 AND s.restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Session de caisse');
  return toSession(row);
}

export async function listSessions(
  restaurantId: string,
  input: ListSessionsInput,
): Promise<Paginated<CashSession>> {
  const total = await queryOne<{ count: number }>(
    'SELECT count(*)::int AS count FROM cash_sessions WHERE restaurant_id = $1',
    [restaurantId],
  );
  const rows = await query<SessionRow>(
    `${SELECT} WHERE s.restaurant_id = $1
      ORDER BY s.opened_at DESC
      LIMIT $2 OFFSET $3`,
    [restaurantId, input.limit, offsetOf(input)],
  );
  return paginate(rows.map(toSession), total?.count ?? 0, input);
}

export async function openSession(actor: Actor, input: OpenSessionInput): Promise<CashSession> {
  const id = await withTransaction(async (tx) => {
    const existing = await tx.queryOne(
      `SELECT 1 FROM cash_sessions WHERE restaurant_id = $1 AND status = 'open'`,
      [actor.restaurantId],
    );
    if (existing) throw conflict('La caisse est déjà ouverte.');

    const ref = await tx.queryOne<{ reference: string }>(
      `SELECT next_document_reference($1, 'cash_session', 'CS') AS reference`,
      [actor.restaurantId],
    );

    try {
      const row = await tx.queryOne<{ id: string }>(
        `INSERT INTO cash_sessions (restaurant_id, reference, opened_by, opening_float, opening_breakdown)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          actor.restaurantId,
          ref?.reference ?? `CS-${Date.now()}`,
          actor.userId,
          round2(input.openingFloat),
          input.breakdown ? JSON.stringify(input.breakdown) : null,
        ],
      );
      if (!row) throw new Error('Ouverture de la caisse impossible.');
      return row.id;
    } catch (error) {
      // Deux ouvertures simultanées : l'index unique tranche.
      if ((error as { code?: string }).code === '23505') {
        throw conflict('La caisse vient d’être ouverte par un collègue.');
      }
      throw error;
    }
  });
  return getSession(actor.restaurantId, id);
}

/**
 * Ce que le tiroir et le compte Mobile Money devraient contenir : le fond
 * de caisse, plus les entrées, moins les sorties de la session. Un
 * mouvement sans mode de paiement (correction manuelle) est compté en
 * espèces, puisque c'est le tiroir qu'on corrige.
 */
async function netByMethod(tx: Tx, sessionId: string): Promise<Record<string, number>> {
  const rows = await tx.query<{ method: string; net: number }>(
    `SELECT COALESCE(payment_method, 'cash') AS method,
            COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net
       FROM cash_movements
      WHERE session_id = $1
      GROUP BY 1`,
    [sessionId],
  );
  return Object.fromEntries(rows.map((row) => [row.method, round2(row.net)]));
}

async function buildSummary(
  tx: Tx,
  restaurantId: string,
  sessionId: string,
  openedAt: Date,
): Promise<SessionSummary> {
  const sales = await tx.query<{ method: string; count: number; total: number }>(
    `SELECT payment_method AS method, count(*)::int AS count, COALESCE(sum(total_amount), 0) AS total
       FROM sales
      WHERE restaurant_id = $1 AND sold_at >= $2 AND sold_at <= now() AND status <> 'cancelled'
      GROUP BY 1`,
    [restaurantId, openedAt],
  );
  const cancelled = await tx.queryOne<{ count: number; total: number }>(
    `SELECT count(*)::int AS count, COALESCE(sum(total_amount), 0) AS total
       FROM sales
      WHERE restaurant_id = $1 AND sold_at >= $2 AND status = 'cancelled'`,
    [restaurantId, openedAt],
  );
  const movements = await tx.query<{ category: string; direction: string; total: number }>(
    `SELECT category, direction, COALESCE(sum(amount), 0) AS total
       FROM cash_movements WHERE session_id = $1
      GROUP BY 1, 2`,
    [sessionId],
  );

  const sum = (category: string, direction: 'in' | 'out') =>
    round2(
      movements
        .filter((row) => row.category === category && row.direction === direction)
        .reduce((total, row) => total + row.total, 0),
    );

  return {
    sales: {
      count: sales.reduce((total, row) => total + row.count, 0),
      total: round2(sales.reduce((total, row) => total + row.total, 0)),
      byMethod: Object.fromEntries(
        sales.map((row) => [row.method, { count: row.count, total: round2(row.total) }]),
      ),
    },
    cancelledSales: { count: cancelled?.count ?? 0, total: round2(cancelled?.total ?? 0) },
    creditRepayments: sum('credit_payment', 'in'),
    // Une annulation de dépense contre-passe en entrée : on présente le net.
    expenses: round2(sum('expense', 'out') - sum('expense', 'in')),
    salaries: round2(sum('salary', 'out') - sum('salary', 'in')),
    capitalIn: sum('capital', 'in'),
    capitalOut: sum('capital', 'out'),
    adjustments: round2(sum('adjustment', 'in') - sum('adjustment', 'out')),
    netByMethod: await netByMethod(tx, sessionId),
  };
}

const formatGnf = (value: number) =>
  `${value < 0 ? '−' : value > 0 ? '+' : ''}${Math.abs(Math.round(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;

/**
 * Clôture à l'aveugle : la personne qui compte ne voit pas l'attendu. Si
 * le compte ne tombe pas juste, on lui demande un motif — sans lui dire de
 * combien il s'écarte, pour qu'il recompte plutôt qu'il n'ajuste.
 */
export async function closeSession(actor: Actor, input: CloseSessionInput): Promise<CashSession> {
  const id = await withTransaction(async (tx) => {
    const session = await tx.queryOne<{ id: string; reference: string; opened_at: Date; opening_float: number }>(
      `SELECT id, reference, opened_at, opening_float FROM cash_sessions
        WHERE restaurant_id = $1 AND status = 'open' FOR UPDATE`,
      [actor.restaurantId],
    );
    if (!session) throw conflict('Aucune caisse n’est ouverte.');

    const net = await netByMethod(tx, session.id);
    const expectedCash = round2(session.opening_float + (net.cash ?? 0));
    const expectedMobileMoney = round2(net.mobile_money ?? 0);
    const cashDifference = round2(input.countedCash - expectedCash);
    const mobileMoneyDifference =
      input.countedMobileMoney !== undefined
        ? round2(input.countedMobileMoney - expectedMobileMoney)
        : null;

    const hasDifference = cashDifference !== 0 || (mobileMoneyDifference ?? 0) !== 0;
    if (hasDifference && !input.note) {
      throw unprocessable(
        'Le comptage ne correspond pas à ce qui est attendu. Recomptez, ou indiquez un motif pour clôturer.',
        [{ field: 'note', message: 'Motif requis.' }],
      );
    }

    const summary = await buildSummary(tx, actor.restaurantId, session.id, session.opened_at);

    await tx.query(
      `UPDATE cash_sessions
          SET status = 'closed', closed_by = $1, closed_at = now(),
              counted_cash = $2, counted_breakdown = $3, counted_mobile_money = $4,
              expected_cash = $5, expected_mobile_money = $6,
              cash_difference = $7, mobile_money_difference = $8,
              close_note = $9, summary = $10
        WHERE id = $11`,
      [
        actor.userId,
        round2(input.countedCash),
        input.breakdown ? JSON.stringify(input.breakdown) : null,
        input.countedMobileMoney !== undefined ? round2(input.countedMobileMoney) : null,
        expectedCash,
        expectedMobileMoney,
        cashDifference,
        mobileMoneyDifference,
        input.note ?? null,
        JSON.stringify(summary),
        session.id,
      ],
    );

    await notify(
      {
        restaurantId: actor.restaurantId,
        to: { permission: 'cash.view' },
        exceptUserId: actor.userId,
        kind: hasDifference ? 'cash.closed_with_difference' : 'cash.closed',
        title: hasDifference ? 'Caisse clôturée avec un écart' : 'Caisse clôturée',
        body: hasDifference
          ? `${session.reference} : écart espèces ${formatGnf(cashDifference)}${
              mobileMoneyDifference ? `, Mobile Money ${formatGnf(mobileMoneyDifference)}` : ''
            }. « ${input.note} »`
          : `${session.reference} : le compte tombe juste. ${summary.sales.count} vente(s).`,
        route: 'cash',
        entityId: session.id,
        actorName: actor.userName,
      },
      tx,
    );

    return session.id;
  });
  return getSession(actor.restaurantId, id);
}

/**
 * Le gérant aligne le solde de caisse sur ce qui a réellement été compté.
 * La correction est datée d'aujourd'hui, hors de toute session : elle
 * rectifie le grand livre, pas le tiroir de la caisse ouverte.
 */
export async function correctSession(actor: Actor, id: string): Promise<CashSession> {
  await withTransaction(async (tx) => {
    const session = await tx.queryOne<{
      reference: string;
      status: string;
      cash_difference: number | null;
      correction_movement_id: string | null;
    }>(
      `SELECT reference, status, cash_difference, correction_movement_id
         FROM cash_sessions WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [id, actor.restaurantId],
    );
    if (!session) throw notFound('Session de caisse');
    if (session.status !== 'closed') throw conflict('La caisse n’est pas encore clôturée.');
    if (session.correction_movement_id) throw conflict('Cet écart a déjà été corrigé.');
    const difference = session.cash_difference ?? 0;
    if (difference === 0) throw conflict('Aucun écart à corriger : le compte tombait juste.');

    const amount = Math.abs(difference);
    const direction = difference > 0 ? 'in' : 'out';
    if (direction === 'out') await assertCashAvailable(tx, actor.restaurantId, amount);

    const movementId = await recordMovement(tx, {
      restaurantId: actor.restaurantId,
      direction,
      amount,
      category: 'adjustment',
      label: `Écart de caisse ${session.reference}`,
      sourceType: 'manual',
      paymentMethod: 'cash',
      createdBy: actor.userId,
      detached: true,
    });

    await tx.query(
      `UPDATE cash_sessions
          SET correction_movement_id = $1, corrected_by = $2, corrected_at = now()
        WHERE id = $3`,
      [movementId, actor.userId, id],
    );
  });
  return getSession(actor.restaurantId, id);
}

/** Le caissier encaisse dans une caisse ouverte ; le gérant peut dépanner sans. */
export async function hasOpenSession(restaurantId: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1 FROM cash_sessions WHERE restaurant_id = $1 AND status = 'open'`,
    [restaurantId],
  );
  return Boolean(row);
}
