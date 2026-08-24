import { authed, queryString } from '../authed';

/** §8 — Créances clients et remboursements. */
export type CreditStatus = 'open' | 'partially_paid' | 'paid' | 'cancelled';

export interface Credit {
  id: string;
  saleId: string;
  saleReference: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  amountDue: number;
  amountPaid: number;
  amountLeft: number;
  status: CreditStatus;
  dueDate: string | null;
  openedAt: string;
  settledAt: string | null;
}

export interface CreditPayment {
  id: string;
  amount: number;
  paymentMethod: string;
  note: string | null;
  paidAt: string;
}

export interface CreditDetail extends Credit {
  payments: CreditPayment[];
}

export interface CreditsPage {
  items: Credit[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  totalOutstanding: number;
}

export const CREDIT_STATUS_LABELS: Record<CreditStatus, string> = {
  open: 'À rembourser',
  partially_paid: 'Partiel',
  paid: 'Soldée',
  cancelled: 'Annulée',
};

export function listCredits(
  filters: { page?: number; limit?: number; status?: CreditStatus; onlyOpen?: boolean } = {},
): Promise<CreditsPage> {
  return authed<CreditsPage>(
    `/api/credits${queryString({
      page: filters.page,
      limit: filters.limit,
      status: filters.status,
      onlyOpen: filters.onlyOpen === undefined ? undefined : String(filters.onlyOpen),
    })}`,
  );
}

export function getCredit(id: string): Promise<CreditDetail> {
  return authed<CreditDetail>(`/api/credits/${id}`);
}

/** Remboursement partiel ou total : − dette, + caisse (§7, §8, §10). */
export function repayCredit(
  id: string,
  payload: { amount: number; paymentMethod: string; note?: string },
): Promise<CreditDetail> {
  return authed<CreditDetail>(`/api/credits/${id}/payments`, { method: 'POST', body: payload });
}
