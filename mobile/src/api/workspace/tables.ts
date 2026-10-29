import { authed } from '../authed';
import { invalidateCache } from '../cache';

export type TableState = 'free' | 'occupied' | 'cooking' | 'ready' | 'bill';
export type BillStatus = 'open' | 'bill_requested' | 'paid' | 'cancelled';
export type ItemStatus = 'sent' | 'preparing' | 'ready' | 'served' | 'cancelled';

export interface BillSummary {
  id: string;
  reference: string;
  label: string | null;
  guests: number;
  status: 'open' | 'bill_requested';
  waiterName: string | null;
  total: number;
  openedAt: string;
}

export interface DiningTable {
  id: string;
  name: string;
  area: string | null;
  position: number;
  isActive: boolean;
  state: TableState;
  bills: BillSummary[];
}

export interface BillItem {
  id: string;
  ticketId: string;
  dishId: string | null;
  dishName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  note: string | null;
  status: ItemStatus;
  createdAt: string;
  readyAt: string | null;
  servedAt: string | null;
  cancelledReason: string | null;
}

export interface Bill {
  id: string;
  reference: string;
  tableId: string;
  tableName: string;
  label: string | null;
  guests: number;
  status: BillStatus;
  waiter: { id: string; fullName: string } | null;
  total: number;
  openedAt: string;
  billRequestedAt: string | null;
  paidAt: string | null;
  saleId: string | null;
  saleReference: string | null;
  closedReason: string | null;
  items: BillItem[];
}

export interface KitchenTicket {
  id: string;
  source: 'table' | 'online';
  title: string;
  waiterName: string | null;
  status: 'new' | 'preparing' | 'ready';
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  items: Array<{ id: string; dishName: string; quantity: number; note: string | null; status: ItemStatus }>;
}

export interface KitchenBoard {
  warnMinutes: number;
  lateMinutes: number;
  serverTime: string;
  data: KitchenTicket[];
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  sent: 'Envoyé',
  preparing: 'En préparation',
  ready: 'Prêt à servir',
  served: 'Servi',
  cancelled: 'Annulé',
};

export const TABLE_STATE_LABELS: Record<TableState, string> = {
  free: 'Libre',
  occupied: 'Occupée',
  cooking: 'En cuisine',
  ready: 'Plat prêt',
  bill: 'Addition demandée',
};

/** « Table 5 · Groupe de 4 », ou le numéro de l'addition. */
export function billName(bill: { tableName?: string; label: string | null; reference: string }): string {
  const own = bill.label || `Addition ${bill.reference.slice(-4)}`;
  return bill.tableName ? `${bill.tableName} · ${own}` : own;
}

// --- Plan de salle -------------------------------------------------------------

export async function listTables(all = false): Promise<DiningTable[]> {
  const result = await authed<{ data: DiningTable[] }>(`/api/tables${all ? '?all=true' : ''}`);
  return result.data;
}

export function createTable(payload: { name: string; area?: string | null }): Promise<{ id: string }> {
  return authed('/api/tables', { method: 'POST', body: payload });
}

export function createTablesBatch(count: number, area?: string | null): Promise<{ created: number }> {
  return authed('/api/tables/batch', { method: 'POST', body: { count, area: area ?? null } });
}

export function updateTable(
  id: string,
  payload: Partial<{ name: string; area: string | null; isActive: boolean }>,
): Promise<void> {
  return authed(`/api/tables/${id}`, { method: 'PATCH', body: payload });
}

export function deleteTable(id: string): Promise<void> {
  return authed(`/api/tables/${id}`, { method: 'DELETE' });
}

export function fetchKitchenSettings(): Promise<{ warnMinutes: number; lateMinutes: number }> {
  return authed('/api/tables/kitchen-settings');
}

export function updateKitchenSettings(warnMinutes: number, lateMinutes: number) {
  return authed<{ warnMinutes: number; lateMinutes: number }>('/api/tables/kitchen-settings', {
    method: 'PATCH',
    body: { warnMinutes, lateMinutes },
  });
}

// --- Additions -----------------------------------------------------------------

export function openBill(tableId: string, payload: { label?: string | null; guests: number }): Promise<Bill> {
  return authed<Bill>(`/api/tables/${tableId}/bills`, { method: 'POST', body: payload });
}

export function getBill(id: string): Promise<Bill> {
  return authed<Bill>(`/api/bills/${id}`);
}

export async function listBills(status: 'active' | 'paid' = 'active'): Promise<Bill[]> {
  const result = await authed<{ data: Bill[] }>(`/api/bills?status=${status}`);
  return result.data;
}

export async function sendToKitchen(
  billId: string,
  items: Array<{ dishId: string; quantity: number; note?: string | null }>,
): Promise<Bill> {
  const bill = await authed<Bill>(`/api/bills/${billId}/send`, { method: 'POST', body: { items } });
  // Les portions viennent d'être prises : la carte en cache est périmée.
  invalidateCache('menu:list');
  return bill;
}

export function requestBill(billId: string): Promise<Bill> {
  return authed<Bill>(`/api/bills/${billId}/request`, { method: 'POST', body: {} });
}

export async function payBill(
  billId: string,
  payload: { paymentMethod: 'cash' | 'mobile_money' | 'card' | 'credit'; customerId?: string },
): Promise<Bill> {
  const bill = await authed<Bill>(`/api/bills/${billId}/pay`, { method: 'POST', body: payload });
  invalidateCache();
  return bill;
}

export function cancelBill(billId: string, reason: string): Promise<Bill> {
  return authed<Bill>(`/api/bills/${billId}/cancel`, { method: 'POST', body: { reason } });
}

export function markItemServed(itemId: string): Promise<Bill> {
  return authed<Bill>(`/api/bills/items/${itemId}/served`, { method: 'POST', body: {} });
}

export async function cancelBillItem(itemId: string, reason: string): Promise<Bill> {
  const bill = await authed<Bill>(`/api/bills/items/${itemId}/cancel`, { method: 'POST', body: { reason } });
  invalidateCache('menu:list');
  return bill;
}

// --- Cuisine -------------------------------------------------------------------

export function fetchKitchen(): Promise<KitchenBoard> {
  return authed<KitchenBoard>('/api/kitchen');
}

export function startTicket(ticketId: string): Promise<KitchenBoard> {
  return authed<KitchenBoard>(`/api/kitchen/tickets/${ticketId}/start`, { method: 'POST', body: {} });
}

export function markReady(ticketId: string, itemId?: string): Promise<KitchenBoard> {
  return authed<KitchenBoard>(`/api/kitchen/tickets/${ticketId}/ready`, {
    method: 'POST',
    body: itemId ? { itemId } : {},
  });
}
