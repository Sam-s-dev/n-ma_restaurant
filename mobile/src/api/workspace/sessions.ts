import { authed, queryString } from '../authed';
import { invalidateCache } from '../cache';

/** Chiffres de la journée, figés à la clôture (ticket Z). */
export interface SessionSummary {
  sales: { count: number; total: number; byMethod: Record<string, { count: number; total: number }> };
  cancelledSales: { count: number; total: number };
  creditRepayments: number;
  expenses: number;
  salaries: number;
  capitalIn: number;
  capitalOut: number;
  adjustments: number;
  netByMethod: Record<string, number>;
}

/**
 * Session de caisse. Pour le caissier, l'attendu, l'écart et le résumé
 * restent absents : il compte à l'aveugle.
 */
export interface CashSession {
  id: string;
  reference: string;
  status: 'open' | 'closed';
  openedByName: string | null;
  openedAt: string;
  openingFloat: number;
  openingBreakdown?: Record<string, number> | null;
  closedByName: string | null;
  closedAt: string | null;
  countedCash: number | null;
  countedBreakdown?: Record<string, number> | null;
  countedMobileMoney: number | null;
  expectedCash?: number | null;
  expectedMobileMoney?: number | null;
  cashDifference?: number | null;
  mobileMoneyDifference?: number | null;
  closeNote?: string | null;
  summary?: SessionSummary | null;
  correctedByName?: string | null;
  correctedAt?: string | null;
}

export interface SessionsPage {
  items: CashSession[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Billets et pièces en circulation en Guinée, du plus gros au plus petit. */
export const GNF_DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500] as const;

export async function fetchCurrentSession(): Promise<CashSession | null> {
  const { session } = await authed<{ session: CashSession | null }>('/api/cash/sessions/current');
  return session;
}

export function openSession(payload: {
  openingFloat: number;
  breakdown?: Record<string, number>;
}): Promise<CashSession> {
  return authed<CashSession>('/api/cash/sessions/open', { method: 'POST', body: payload });
}

export function closeSession(payload: {
  countedCash: number;
  breakdown?: Record<string, number>;
  countedMobileMoney?: number;
  note?: string;
}): Promise<CashSession> {
  return authed<CashSession>('/api/cash/sessions/close', { method: 'POST', body: payload });
}

export function listSessions(filters: { page?: number; limit?: number } = {}): Promise<SessionsPage> {
  return authed<SessionsPage>(`/api/cash/sessions${queryString(filters)}`);
}

export function getSession(id: string): Promise<CashSession> {
  return authed<CashSession>(`/api/cash/sessions/${id}`);
}

/** Aligne le solde de caisse sur ce qui a été compté. */
export function correctSession(id: string): Promise<CashSession> {
  return authed<CashSession>(`/api/cash/sessions/${id}/correct`, { method: 'POST' }).then(
    (session) => {
      invalidateCache('dashboard:');
      return session;
    },
  );
}
