import { authed, queryString } from '../authed';

/** §6 — Stock des matières premières. */
export interface StockItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  purchasePrice: number;
  alertThreshold: number;
  stockValue: number;
  isLow: boolean;
  isArchived: boolean;
}

export interface StockMovement {
  id: string;
  direction: 'in' | 'out';
  quantity: number;
  unitPrice: number | null;
  reason: string;
  quantityAfter: number;
  note: string | null;
  occurredAt: string;
  createdByName: string | null;
}

export interface StockList {
  items: StockItem[];
  summary: { totalValue: number; lowCount: number };
}

export const STOCK_UNITS = [
  'kg',
  'g',
  'l',
  'ml',
  'piece',
  'sachet',
  'carton',
  'bouteille',
  'casier',
  'sac',
] as const;

export const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'mL',
  piece: 'pièce',
  sachet: 'sachet',
  carton: 'carton',
  bouteille: 'bouteille',
  casier: 'casier',
  sac: 'sac',
};

export const MOVEMENT_REASONS: Record<string, string> = {
  purchase: 'Achat',
  initial: 'Stock initial',
  adjustment: 'Correction',
  loss: 'Perte',
};

export function listStock(
  filters: { search?: string; onlyLow?: boolean } = {},
): Promise<StockList> {
  return authed<StockList>(
    `/api/stock${queryString({
      search: filters.search,
      onlyLow: filters.onlyLow ? 'true' : undefined,
    })}`,
  );
}

export function createStockItem(payload: {
  name: string;
  unit: string;
  quantity?: number;
  purchasePrice?: number;
  alertThreshold?: number;
}): Promise<StockItem> {
  return authed<StockItem>('/api/stock', { method: 'POST', body: payload });
}

export function updateStockItem(
  id: string,
  payload: { name?: string; unit?: string; purchasePrice?: number; alertThreshold?: number },
): Promise<StockItem> {
  return authed<StockItem>(`/api/stock/${id}`, { method: 'PATCH', body: payload });
}

/**
 * Correction d'inventaire ou perte. Un achat passe par le module Dépenses
 * (§6, §9) pour que la caisse soit débitée en même temps.
 */
export function adjustStock(
  id: string,
  payload: { direction: 'in' | 'out'; quantity: number; reason: 'adjustment' | 'loss'; note?: string },
): Promise<StockItem> {
  return authed<StockItem>(`/api/stock/${id}/adjustments`, { method: 'POST', body: payload });
}

export async function listStockMovements(id: string): Promise<StockMovement[]> {
  const { items } = await authed<{ items: StockMovement[] }>(`/api/stock/${id}/movements`);
  return items;
}

export function deleteStockItem(id: string): Promise<void> {
  return authed<void>(`/api/stock/${id}`, { method: 'DELETE' });
}

export async function listAlerts(): Promise<StockItem[]> {
  const { items } = await authed<{ items: StockItem[] }>('/api/stock/alerts');
  return items;
}
