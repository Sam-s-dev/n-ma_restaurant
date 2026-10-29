import { withSnapshot } from '../offline';
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
  const path = `/api/customers${queryString({
    search: filters.search,
    onlyDebtors: filters.onlyDebtors ? 'true' : undefined,
  })}`;
  // Le carnet complet est gardé : la vente à crédit d'un client connu reste
  // possible pendant une coupure.
  const fetch = () => authed<{ items: Customer[]; totalDue: number }>(path);
  return filters.search || filters.onlyDebtors ? fetch() : withSnapshot('customers:all', fetch);
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
