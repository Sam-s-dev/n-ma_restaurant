import { authed, queryString } from '../authed';
import { invalidateCache } from '../cache';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type OrderPayment = 'cash' | 'mobile_money';

export interface OrderItem {
  dishId: string | null;
  dishName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** Commande passée sur le mini-site, vue du restaurant. */
export interface OnlineOrder {
  id: string;
  reference: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  mode: 'delivery' | 'pickup';
  zoneName: string | null;
  landmark: string | null;
  note: string | null;
  paymentMethod: OrderPayment;
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  status: OrderStatus;
  driver: { id: string; fullName: string; phone: string | null } | null;
  collectedMethod: OrderPayment | null;
  deliveryIssue: string | null;
  closedReason: string | null;
  cancelledByCustomer: boolean;
  saleId: string | null;
  saleReference: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  items: OrderItem[];
}

export type OrderGroup = 'active' | 'to_settle' | 'closed';

export interface OrdersPage {
  data: OnlineOrder[];
  counts: { active: number; pending: number; to_settle: number; closed: number };
}

export interface Driver {
  id: string;
  fullName: string;
  phone: string | null;
  activeCount: number;
  toHandOverCount: number;
  toHandOver: number;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'À confirmer',
  accepted: 'En préparation',
  ready: 'Prête',
  out_for_delivery: 'En route',
  delivered: 'Livrée',
  completed: 'Encaissée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
};

export const PAYMENT_LABELS: Record<OrderPayment, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
};

export function listOrders(group: OrderGroup): Promise<OrdersPage> {
  return authed<OrdersPage>(`/api/orders${queryString({ group })}`);
}

export async function listDrivers(): Promise<Driver[]> {
  const result = await authed<{ data: Driver[] }>('/api/orders/drivers');
  return result.data;
}

function action(path: string, body?: unknown): Promise<OnlineOrder> {
  return authed<OnlineOrder>(path, { method: 'POST', body: body ?? {} });
}

export const acceptOrder = (id: string) => action(`/api/orders/${id}/accept`);
export const rejectOrder = (id: string, reason: string) =>
  action(`/api/orders/${id}/reject`, { reason });
export const markOrderReady = (id: string) => action(`/api/orders/${id}/ready`);
export const assignDriver = (id: string, driverId: string) =>
  action(`/api/orders/${id}/assign`, { driverId });
export const cancelOrder = (id: string, reason: string) =>
  action(`/api/orders/${id}/cancel`, { reason });

/** L'argent entre en caisse : la commande devient une vente. */
export async function completeOrder(id: string, paymentMethod?: OrderPayment): Promise<OnlineOrder> {
  const order = await action(`/api/orders/${id}/complete`, paymentMethod ? { paymentMethod } : {});
  invalidateCache();
  return order;
}

// --- Livreur -----------------------------------------------------------------

export function listMyDeliveries(): Promise<{ data: OnlineOrder[]; toHandOver: number }> {
  return authed('/api/deliveries');
}

export const dispatchDelivery = (id: string) => action(`/api/deliveries/${id}/dispatch`);
export const deliverDelivery = (id: string, collectedMethod: OrderPayment) =>
  action(`/api/deliveries/${id}/deliver`, { collectedMethod });
export const reportDeliveryIssue = (id: string, issue: string) =>
  action(`/api/deliveries/${id}/issue`, { issue });

// --- Réglages du mini-site ------------------------------------------------------

export interface OnlineSettings {
  slug: string | null;
  suggestedSlug: string;
  /** Autorisé par l'éditeur de l'application. */
  allowed: boolean;
  enabled: boolean;
  delivery: boolean;
  pickup: boolean;
  opensAt: string | null;
  closesAt: string | null;
  message: string | null;
}

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

export function fetchOnlineSettings(): Promise<OnlineSettings> {
  return authed<OnlineSettings>('/api/online/settings');
}

export function updateOnlineSettings(payload: Partial<Omit<OnlineSettings, 'suggestedSlug' | 'allowed'>>): Promise<OnlineSettings> {
  return authed<OnlineSettings>('/api/online/settings', { method: 'PATCH', body: payload });
}

export async function listZones(): Promise<DeliveryZone[]> {
  const result = await authed<{ data: DeliveryZone[] }>('/api/online/zones');
  return result.data;
}

export function createZone(payload: { name: string; fee: number }): Promise<DeliveryZone> {
  return authed<DeliveryZone>('/api/online/zones', { method: 'POST', body: payload });
}

export function updateZone(id: string, payload: Partial<Omit<DeliveryZone, 'id'>>): Promise<DeliveryZone> {
  return authed<DeliveryZone>(`/api/online/zones/${id}`, { method: 'PATCH', body: payload });
}

export function deleteZone(id: string): Promise<void> {
  return authed<void>(`/api/online/zones/${id}`, { method: 'DELETE' });
}
