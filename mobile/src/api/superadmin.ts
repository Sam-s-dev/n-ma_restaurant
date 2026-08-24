import { request } from './client';

export type RestaurantStatus = 'pending' | 'active' | 'disabled';

export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
}

export interface AdminLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  admin: AdminProfile;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: RestaurantStatus;
  statusReason: string | null;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimals: number;
  logoMediaId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  usersCount: number;
  salesCount: number;
  createdAt: string;
  activatedAt: string | null;
  disabledAt: string | null;
}

export interface RestaurantPage {
  items: RestaurantSummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PlatformStats {
  restaurants_total: number;
  restaurants_pending: number;
  restaurants_active: number;
  restaurants_disabled: number;
  users_total: number;
  sales_last_30d: number;
}

export function login(email: string, password: string): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>('/api/super-admin/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function stats(token: string): Promise<PlatformStats> {
  return request<PlatformStats>('/api/super-admin/stats', { token });
}

export function listRestaurants(
  token: string,
  options: { status?: RestaurantStatus; search?: string; page?: number } = {},
): Promise<RestaurantPage> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.search) params.set('search', options.search);
  params.set('page', String(options.page ?? 1));
  params.set('limit', '50');

  return request<RestaurantPage>(`/api/super-admin/restaurants?${params.toString()}`, { token });
}

/** §2.a — débloque la connexion pour ce restaurant. */
export function activateRestaurant(
  token: string,
  id: string,
  reason?: string,
): Promise<RestaurantSummary> {
  return request<RestaurantSummary>(`/api/super-admin/restaurants/${id}/activate`, {
    method: 'POST',
    token,
    body: reason ? { reason } : {},
  });
}

/** §2.a — coupe l'accès. Les sessions ouvertes sont révoquées côté serveur. */
export function disableRestaurant(
  token: string,
  id: string,
  reason: string,
): Promise<RestaurantSummary> {
  return request<RestaurantSummary>(`/api/super-admin/restaurants/${id}/disable`, {
    method: 'POST',
    token,
    body: { reason },
  });
}
