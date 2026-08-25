import { authed, queryString } from '../authed';

/** §7 — Caisse : solde et grand livre des mouvements. */
export type CashDirection = 'in' | 'out';
export type CashCategory =
  | 'sale'
  | 'credit_payment'
  | 'expense'
  | 'salary'
  | 'adjustment'
  | 'capital';

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
  adjustment: 'Correction',
  capital: 'Apport',
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
 * Correction d'une erreur de saisie. Le grand livre n'est jamais modifié :
 * une écriture inverse est ajoutée.
 */
export function adjustCash(payload: {
  direction: CashDirection;
  amount: number;
  label: string;
}): Promise<CashBalance> {
  return authed<CashBalance>('/api/cash/adjustments', { method: 'POST', body: payload });
}

/**
 * §7 — Apport (ou retrait) du gérant : l'argent qu'il met de sa poche dans
 * la caisse pour démarrer la journée ou couvrir un achat. Classé à part des
 * ventes et des remboursements, qui viennent eux des clients.
 */
export function contributeCash(payload: {
  direction: CashDirection;
  amount: number;
  label?: string;
  paymentMethod?: string;
}): Promise<CashBalance> {
  return authed<CashBalance>('/api/cash/contributions', { method: 'POST', body: payload });
}
