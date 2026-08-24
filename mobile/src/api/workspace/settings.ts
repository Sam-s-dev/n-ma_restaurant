import { authed } from '../authed';
import type { Profile } from '../auth';

/** §3 — Paramètres du restaurant, §2.b — équipe. */
export interface RestaurantSettings {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoMediaId: string | null;
  logoUrl: string | null;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimals: number;
  status: string;
  createdAt: string;
}

export interface Member {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isOwner: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
  /** Communiqué une seule fois, à la création. */
  token?: string;
}

export function fetchSettings(): Promise<RestaurantSettings> {
  return authed<RestaurantSettings>('/api/restaurant');
}

export function updateSettings(payload: {
  name?: string;
  address?: string | null;
  phone?: string | null;
  currencyCode?: string;
  currencySymbol?: string;
  currencyDecimals?: number;
}): Promise<RestaurantSettings> {
  return authed<RestaurantSettings>('/api/restaurant', { method: 'PATCH', body: payload });
}

export function fetchProfile(): Promise<Profile> {
  return authed<Profile>('/api/auth/me');
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return authed<void>('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export async function listMembers(): Promise<Member[]> {
  const { items } = await authed<{ items: Member[] }>('/api/users');
  return items;
}

export function updateMember(
  id: string,
  payload: { fullName?: string; phone?: string | null; isActive?: boolean },
): Promise<Member> {
  return authed<Member>(`/api/users/${id}`, { method: 'PATCH', body: payload });
}

export async function listInvitations(): Promise<Invitation[]> {
  const { items } = await authed<{ items: Invitation[] }>('/api/users/invitations/list');
  return items;
}

/**
 * §2.b — Le jeton est renvoyé une seule fois : c'est au gérant de le
 * transmettre (WhatsApp, SMS). Il n'est jamais restocké en clair.
 */
export function inviteMember(email: string, expiresInDays = 7): Promise<Invitation> {
  return authed<Invitation>('/api/users/invitations', {
    method: 'POST',
    body: { email, expiresInDays },
  });
}

export function revokeInvitation(id: string): Promise<void> {
  return authed<void>(`/api/users/invitations/${id}`, { method: 'DELETE' });
}
