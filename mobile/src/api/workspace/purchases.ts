import { authed, queryString } from '../authed';
import { invalidateCache } from '../cache';

export type PurchaseStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

/** Demande d'achat : le magasinier demande, le gérant décide, puis l'achat est fait. */
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

export interface PurchasesPage {
  items: PurchaseRequest[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  pendingCount: number;
  approvedCount: number;
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Refusée',
  completed: 'Achetée',
  cancelled: 'Annulée',
};

export function listPurchases(
  filters: { status?: PurchaseStatus; page?: number; limit?: number } = {},
): Promise<PurchasesPage> {
  return authed<PurchasesPage>(`/api/purchases${queryString(filters)}`);
}

export function createPurchase(payload: {
  stockItemId?: string;
  itemName?: string;
  unit?: string;
  quantity: number;
  estimatedAmount: number;
  reason?: string;
}): Promise<PurchaseRequest> {
  return authed<PurchaseRequest>('/api/purchases', { method: 'POST', body: payload });
}

export function approvePurchase(
  id: string,
  payload: { approvedAmount?: number; note?: string },
): Promise<PurchaseRequest> {
  return authed<PurchaseRequest>(`/api/purchases/${id}/approve`, { method: 'POST', body: payload });
}

export function rejectPurchase(id: string, note: string): Promise<PurchaseRequest> {
  return authed<PurchaseRequest>(`/api/purchases/${id}/reject`, {
    method: 'POST',
    body: { note },
  });
}

/** L'achat réel : la caisse baisse et le stock monte, en une seule opération. */
export function completePurchase(
  id: string,
  payload: { amount: number; quantity?: number; paymentMethod?: string; note?: string },
): Promise<PurchaseRequest> {
  return authed<PurchaseRequest>(`/api/purchases/${id}/complete`, {
    method: 'POST',
    body: payload,
  }).then((request) => {
    invalidateCache('dashboard:');
    return request;
  });
}

export function cancelPurchase(id: string, note?: string): Promise<PurchaseRequest> {
  return authed<PurchaseRequest>(`/api/purchases/${id}/cancel`, {
    method: 'POST',
    body: note ? { note } : {},
  });
}
