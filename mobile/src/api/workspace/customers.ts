import { authed, queryString } from '../authed';

/** §8 — Fiches clients, alimentées par les ventes à crédit. */
export interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  note: string | null;
  totalDue: number;
  openCredits: number;
  lifetimeCredited: number;
  lifetimeRepaid: number;
  lastCreditAt: string | null;
}

export function listCustomers(
  filters: { search?: string; onlyDebtors?: boolean } = {},
): Promise<{ items: Customer[]; totalDue: number }> {
  return authed<{ items: Customer[]; totalDue: number }>(
    `/api/customers${queryString({
      search: filters.search,
      onlyDebtors: filters.onlyDebtors ? 'true' : undefined,
    })}`,
  );
}

export function createCustomer(payload: {
  fullName: string;
  phone?: string | null;
  note?: string | null;
}): Promise<Customer> {
  return authed<Customer>('/api/customers', { method: 'POST', body: payload });
}

export function updateCustomer(
  id: string,
  payload: { fullName?: string; phone?: string | null; note?: string | null },
): Promise<Customer> {
  return authed<Customer>(`/api/customers/${id}`, { method: 'PATCH', body: payload });
}

export function deleteCustomer(id: string): Promise<void> {
  return authed<void>(`/api/customers/${id}`, { method: 'DELETE' });
}
