import { request } from './client';

/** Réponse de POST /api/auth/register (compte créé en attente d'activation). */
export interface RegisterResponse {
  restaurantId: string;
  userId: string;
  status: 'pending' | 'active' | 'disabled';
  message: string;
}

export interface RegisterPayload {
  restaurantName: string;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  restaurantPhone?: string;
  address?: string;
}

export interface Profile {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    isOwner: boolean;
  };
  restaurant: {
    id: string;
    name: string;
    status: string;
    currencyCode: string;
    currencySymbol: string;
    currencyDecimals: number;
    logoMediaId: string | null;
  };
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  profile: Profile;
}

/**
 * Crée l'espace du restaurant. Le compte naît avec le statut `pending` :
 * aucune session n'est ouverte tant que le Super Admin n'a pas activé
 * le compte (cahier des charges §2.a).
 */
export function register(payload: RegisterPayload): Promise<RegisterResponse> {
  return request<RegisterResponse>('/api/auth/register', {
    method: 'POST',
    body: {
      restaurantName: payload.restaurantName,
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      // Le numéro saisi sert à la fois de contact gérant et de contact
      // restaurant : un seul champ à remplir à l'inscription.
      ...(payload.phone ? { phone: payload.phone, restaurantPhone: payload.phone } : {}),
      ...(payload.address ? { address: payload.address } : {}),
    },
  });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function logout(refreshToken: string): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST', body: { refreshToken } });
}
