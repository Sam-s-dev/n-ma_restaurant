import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../core/errors';

export type SubjectType = 'user' | 'super_admin';

export interface AccessTokenPayload {
  sub: string;
  typ: SubjectType;
  /** Identifiant du restaurant — présent uniquement pour un utilisateur. */
  rid?: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.accessTokenTtl as SignOptions['expiresIn'],
    issuer: 'restaurant-api',
  };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { issuer: 'restaurant-api' });
    if (typeof decoded === 'string') throw new Error('payload inattendu');
    return decoded as AccessTokenPayload;
  } catch {
    throw unauthorized('Session expirée ou jeton invalide.');
  }
}

/**
 * Les refresh tokens sont des secrets aléatoires : seul leur hash est stocké,
 * une fuite de la base ne permet donc pas de rejouer une session.
 */
export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}
