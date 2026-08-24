import type { RequestHandler } from 'express';
import { AppError } from '../core/errors';

/**
 * Limiteur en mémoire, volontairement minimal : il protège les routes
 * d'authentification du bourrinage de mots de passe. Une seule instance
 * d'API est prévue sur Render ; si l'on passe à plusieurs instances,
 * remplacer par un compteur partagé (Redis).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Purge périodique pour éviter que la map ne grossisse indéfiniment.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
sweeper.unref();

export function rateLimit(options: { windowMs: number; max: number; key?: string }): RequestHandler {
  const { windowMs, max, key = 'default' } = options;

  return (req, _res, next) => {
    const identifier = `${key}:${req.ip ?? 'inconnu'}`;
    const now = Date.now();
    const bucket = buckets.get(identifier);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(identifier, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      return next(
        new AppError(
          429,
          'TOO_MANY_REQUESTS',
          `Trop de tentatives. Réessayez dans ${retryAfter} seconde(s).`,
        ),
      );
    }
    next();
  };
}

export const authRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, key: 'auth' });
