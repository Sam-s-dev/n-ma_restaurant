import { request } from './client';
import type { OrderPayment, OrderStatus } from './workspace/orders';

/**
 * Mini-site de commande : appels publics, sans compte. Chaque restaurant
 * est joint par son adresse, chaque commande par son code de suivi.
 */

export interface PublicMenu {
  restaurant: {
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    logoUrl: string | null;
    message: string | null;
    currencyCode: string;
    currencySymbol: string;
    currencyDecimals: number;
  };
  ordering: {
    open: boolean;
    closedReason: 'disabled' | 'hours' | null;
    opensAt: string | null;
    closesAt: string | null;
    delivery: boolean;
    pickup: boolean;
  };
  zones: Array<{ id: string; name: string; fee: number }>;
  categories: Array<{ id: string; name: string }>;
  dishes: Array<{
    id: string;
    name: string;
    description: string | null;
    categoryId: string | null;
    photoUrl: string | null;
    price: number;
    soldOut: boolean;
  }>;
}

export type PublicDish = PublicMenu['dishes'][number];

export interface TrackedOrder {
  trackingCode: string;
  reference: string;
  status: OrderStatus;
  mode: 'delivery' | 'pickup';
  customerName: string;
  zoneName: string | null;
  landmark: string | null;
  paymentMethod: OrderPayment;
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  items: Array<{ dishName: string; unitPrice: number; quantity: number; lineTotal: number }>;
  driverName: string | null;
  closedReason: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  closedAt: string | null;
  restaurant: {
    name: string;
    slug: string | null;
    phone: string | null;
    currencySymbol: string;
    currencyDecimals: number;
  };
}

export interface PlaceOrderPayload {
  customerName: string;
  customerPhone: string;
  mode: 'delivery' | 'pickup';
  zoneId?: string | null;
  landmark?: string | null;
  note?: string | null;
  paymentMethod: OrderPayment;
  items: Array<{ dishId: string; quantity: number }>;
}

export function fetchPublicMenu(slug: string): Promise<PublicMenu> {
  return request<PublicMenu>(`/api/public/r/${encodeURIComponent(slug)}`);
}

/** Jamais rejouée automatiquement : une commande ne doit pas partir deux fois. */
export function placeOrder(slug: string, payload: PlaceOrderPayload): Promise<TrackedOrder> {
  return request<TrackedOrder>(`/api/public/r/${encodeURIComponent(slug)}/orders`, {
    method: 'POST',
    body: payload,
  });
}

export function trackOrder(code: string): Promise<TrackedOrder> {
  return request<TrackedOrder>(`/api/public/orders/${encodeURIComponent(code)}`);
}

export function cancelTrackedOrder(code: string): Promise<TrackedOrder> {
  return request<TrackedOrder>(`/api/public/orders/${encodeURIComponent(code)}/cancel`, {
    method: 'POST',
  });
}
