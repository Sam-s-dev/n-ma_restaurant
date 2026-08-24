import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { forbidden, unauthorized } from '../core/errors';
import { queryOne } from '../db/pool';
import { verifyAccessToken } from '../utils/tokens';

export interface AuthenticatedUser {
  id: string;
  restaurantId: string;
  email: string;
  fullName: string;
  isOwner: boolean;
}

export interface AuthenticatedSuperAdmin {
  id: string;
  email: string;
  fullName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      superAdmin?: AuthenticatedSuperAdmin;
    }
  }
}

function extractBearer(req: Request): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('En-tête Authorization manquant.');
  }
  const token = header.slice(7).trim();
  if (!token) throw unauthorized('Jeton vide.');
  return token;
}

/**
 * Utilisateur d'un restaurant. Revalide à chaque requête que le compte est
 * actif ET que le restaurant est toujours activé par le Super Admin :
 * une désactivation coupe l'accès immédiatement, sans attendre l'expiration
 * du jeton (cahier des charges §2.a).
 */
export const requireUser: RequestHandler = async (req, _res, next) => {
  try {
    const payload = verifyAccessToken(extractBearer(req));
    if (payload.typ !== 'user' || !payload.rid) {
      throw forbidden('Ce jeton n’est pas un jeton utilisateur de restaurant.');
    }

    const row = await queryOne<{
      id: string;
      restaurant_id: string;
      email: string;
      full_name: string;
      is_owner: boolean;
      is_active: boolean;
      restaurant_status: string;
    }>(
      `SELECT u.id, u.restaurant_id, u.email, u.full_name, u.is_owner, u.is_active,
              r.status AS restaurant_status
         FROM users u
         JOIN restaurants r ON r.id = u.restaurant_id
        WHERE u.id = $1 AND u.restaurant_id = $2`,
      [payload.sub, payload.rid],
    );

    if (!row) throw unauthorized('Compte introuvable.');
    if (!row.is_active) throw forbidden('Votre compte a été désactivé.');
    if (row.restaurant_status !== 'active') {
      throw forbidden(
        row.restaurant_status === 'pending'
          ? 'Votre restaurant est en attente de validation par l’administrateur.'
          : 'L’accès de votre restaurant a été suspendu. Contactez l’administrateur.',
      );
    }

    req.user = {
      id: row.id,
      restaurantId: row.restaurant_id,
      email: row.email,
      fullName: row.full_name,
      isOwner: row.is_owner,
    };
    next();
  } catch (error) {
    next(error);
  }
};

/** Espace Super Admin (§2.a). */
export const requireSuperAdmin: RequestHandler = async (req, _res, next) => {
  try {
    const payload = verifyAccessToken(extractBearer(req));
    if (payload.typ !== 'super_admin') {
      throw forbidden('Accès réservé au Super Admin.');
    }

    const row = await queryOne<{
      id: string;
      email: string;
      full_name: string;
      is_active: boolean;
    }>('SELECT id, email, full_name, is_active FROM super_admins WHERE id = $1', [payload.sub]);

    if (!row) throw unauthorized('Compte Super Admin introuvable.');
    if (!row.is_active) throw forbidden('Compte Super Admin désactivé.');

    req.superAdmin = { id: row.id, email: row.email, fullName: row.full_name };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Raccourci utilisé par tous les contrôleurs métier : garantit que le
 * `restaurant_id` injecté dans les requêtes SQL vient du jeton vérifié,
 * jamais du corps de la requête.
 */
export function currentUser(req: Request): AuthenticatedUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function currentSuperAdmin(req: Request): AuthenticatedSuperAdmin {
  if (!req.superAdmin) throw unauthorized();
  return req.superAdmin;
}

export type { NextFunction, Response };
