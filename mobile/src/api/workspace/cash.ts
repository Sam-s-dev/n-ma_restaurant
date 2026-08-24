import { authed, queryString } from '../authed';

/** §7 — Caisse : solde et grand livre des mouvements. */
export type CashDirection = 'in' | 'out';
export type CashCategory = 'sale' | 'credit_payment' | 'expense' | 'salary' | 'adjustment';

export interface CashBalance {
  balance: number;
  totalIn: number;
  totalOut: number;
  updatedAt: string | null;
}

export interface CashMovement {
  id: string;
  direction: CashDirection;
  amount: number;
  category: CashCategory;
  sourceType: string | null;
  sourceId: string | null;
  paymentMethod: string | null;
  label: string;
  occurredAt: string;
  createdByName: string | null;
}

export interface MovementsPage {
  items: CashMovement[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  totals: { in: number; out: number; net: number };
}

export const CATEGORY_LABELS: Record<CashCategory, string> = {
  sale: 'Vente',
  credit_payment: 'Remboursement',
  expense: 'Dépense',
  salary: 'Salaire',
  adjustment: 'Ajustement',
};

export function fetchBalance(): Promise<CashBalance> {
  return authed<CashBalance>('/api/cash/balance');
}

export function listMovements(
  filters: {
    page?: number;
    limit?: number;
    direction?: CashDirection;
    category?: CashCategory;
    from?: string;
    to?: string;
  } = {},
): Promise<MovementsPage> {
  return authed<MovementsPage>(`/api/cash/movements${queryString(filters)}`);
}

/**
 * Correction manuelle du solde : fonds de caisse initial, erreur de saisie.
 * Le grand livre n'est jamais modifié, une écriture est ajoutée.
 */
export function adjustCash(payload: {
  direction: CashDirection;
  amount: number;
  label: string;
}): Promise<CashBalance> {
  return authed<CashBalance>('/api/cash/adjustments', { method: 'POST', body: payload });
}
