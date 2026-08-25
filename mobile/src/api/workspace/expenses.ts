import { authed, queryString } from '../authed';

/** §9 — Dépenses. */
export type ExpenseCategory = 'stock_purchase' | 'salary' | 'bill' | 'maintenance' | 'other';

export interface Expense {
  id: string;
  reference: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  paymentMethod: string;
  stockItemId: string | null;
  stockItemName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  employeeId: string | null;
  employeeName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ExpensesPage {
  items: Expense[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  totals: { amount: number; byCategory: Record<string, number> };
}

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  stock_purchase: 'Achat de stock',
  salary: 'Salaire',
  bill: 'Facture',
  maintenance: 'Entretien',
  other: 'Autre',
};

/**
 * Versions courtes pour les légendes de graphiques, où la colonne fait une
 * centaine de points : « Achat de stock » s'y coupait en « Achat de st… ».
 */
export const EXPENSE_SHORT_LABELS: Record<ExpenseCategory, string> = {
  ...EXPENSE_LABELS,
  stock_purchase: 'Achats',
};

/**
 * Catégories saisissables ici. Le salaire en est absent : il s'enregistre
 * depuis la fiche employé pour que l'historique de paie reste juste (§4),
 * règle que le backend applique aussi de son côté.
 */
export const CREATABLE_CATEGORIES: ExpenseCategory[] = [
  'stock_purchase',
  'bill',
  'maintenance',
  'other',
];

export function listExpenses(
  filters: {
    page?: number;
    limit?: number;
    category?: ExpenseCategory;
    from?: string;
    to?: string;
    includeCancelled?: boolean;
  } = {},
): Promise<ExpensesPage> {
  return authed<ExpensesPage>(
    `/api/expenses${queryString({
      page: filters.page,
      limit: filters.limit,
      category: filters.category,
      from: filters.from,
      to: filters.to,
      includeCancelled: filters.includeCancelled ? 'true' : undefined,
    })}`,
  );
}

export function createExpense(payload: {
  amount: number;
  category: ExpenseCategory;
  description: string;
  expenseDate?: string;
  paymentMethod?: string;
  /** Obligatoires pour un achat de stock : la quantité entre en stock (§9). */
  stockItemId?: string;
  quantity?: number;
}): Promise<Expense> {
  return authed<Expense>('/api/expenses', { method: 'POST', body: payload });
}

export function cancelExpense(id: string, reason: string): Promise<Expense> {
  return authed<Expense>(`/api/expenses/${id}/cancel`, { method: 'POST', body: { reason } });
}
