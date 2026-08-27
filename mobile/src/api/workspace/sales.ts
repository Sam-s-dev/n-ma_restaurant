import { authed, queryString } from '../authed';
import { invalidateCache } from '../cache';

/** §8 — Ventes. */
export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'credit';
export type SaleStatus = 'paid' | 'credit' | 'cancelled';

export interface SaleItem {
  id: string;
  dishId: string | null;
  dishName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  reference: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  soldAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdByName: string | null;
  items?: SaleItem[];
  credit?: {
    id: string;
    amountDue: number;
    amountPaid: number;
    amountLeft: number;
    status: string;
    dueDate: string | null;
  } | null;
}

export interface SalesPage {
  items: Sale[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  totals: { amount: number; cashed: number; credit: number };
}

export interface CreateSalePayload {
  items: Array<{ dishId: string; quantity: number; unitPrice?: number }>;
  paymentMethod: PaymentMethod;
  note?: string;
  /**
   * Obligatoire pour une vente à crédit : la fiche client doit exister
   * avant la vente, sans quoi la dette n'est rattachable à personne (§8).
   */
  customerId?: string;
  dueDate?: string;
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  credit: 'Crédit',
  bank_transfer: 'Virement',
  inconnu: 'Non précisé',
};

export const STATUS_LABELS: Record<SaleStatus, string> = {
  paid: 'Encaissée',
  credit: 'À crédit',
  cancelled: 'Annulée',
};

export function createSale(payload: CreateSalePayload): Promise<Sale> {
  return authed<Sale>('/api/sales', { method: 'POST', body: payload }).then((sale) => {
    // Une vente touche la caisse, les portions du menu et tous les chiffres
    // du tableau de bord : les valeurs en cache ne valent plus rien.
    invalidateCache('dashboard:', 'menu:');
    return sale;
  });
}

export function listSales(
  filters: {
    page?: number;
    limit?: number;
    status?: SaleStatus;
    paymentMethod?: PaymentMethod;
    from?: string;
    to?: string;
  } = {},
): Promise<SalesPage> {
  return authed<SalesPage>(`/api/sales${queryString(filters)}`);
}

export function getSale(id: string): Promise<Sale> {
  return authed<Sale>(`/api/sales/${id}`);
}

/** §3, §8 — En-tête du restaurant + lignes de la vente, pour le ticket. */
export interface Receipt {
  restaurant: {
    name: string;
    address: string | null;
    phone: string | null;
    logoUrl: string | null;
    currencySymbol: string;
    currencyDecimals: number;
  };
  sale: Sale;
}

export function getReceipt(id: string): Promise<Receipt> {
  return authed<Receipt>(`/api/sales/${id}/receipt`);
}

export function cancelSale(id: string, reason: string): Promise<Sale> {
  return authed<Sale>(`/api/sales/${id}/cancel`, { method: 'POST', body: { reason } }).then(
    (sale) => {
      invalidateCache('dashboard:', 'menu:');
      return sale;
    },
  );
}
