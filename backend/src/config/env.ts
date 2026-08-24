import 'dotenv/config';

/**
 * Configuration centralisée. L'application refuse de démarrer si une
 * variable critique manque : mieux vaut un crash au boot qu'une faille.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

function asInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Variable d'environnement invalide (entier attendu) : ${name}`);
  }
  return parsed;
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

// En développement on tolère un secret par défaut ; en production jamais.
const jwtSecret = isProduction
  ? required('JWT_SECRET')
  : optional('JWT_SECRET', 'dev-secret-change-me-please-0123456789');

if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit faire au moins 32 caractères en production.');
}

export const env = {
  nodeEnv,
  isProduction,
  port: asInt('PORT', 4000),

  databaseUrl: required('DATABASE_URL'),
  // Render impose TLS sur ses bases managées, sans CA vérifiable côté client.
  databaseSsl: optional('DATABASE_SSL', isProduction ? 'require' : 'disable'),
  dbPoolMax: asInt('DB_POOL_MAX', 10),

  jwtSecret,
  accessTokenTtl: optional('ACCESS_TOKEN_TTL', '2h'),
  refreshTokenTtlDays: asInt('REFRESH_TOKEN_TTL_DAYS', 30),

  bcryptRounds: asInt('BCRYPT_ROUNDS', 12),

  corsOrigins: optional('CORS_ORIGINS', '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  logLevel: optional('LOG_LEVEL', isProduction ? 'info' : 'debug'),

  // Taille max d'une photo (logo, plat, employé).
  maxUploadBytes: asInt('MAX_UPLOAD_BYTES', 3 * 1024 * 1024),

  // Compte Super Admin créé/mis à jour par `npm run seed`.
  seedSuperAdminEmail: optional('SEED_SUPERADMIN_EMAIL', ''),
  seedSuperAdminPassword: optional('SEED_SUPERADMIN_PASSWORD', ''),
  seedSuperAdminName: optional('SEED_SUPERADMIN_NAME', 'Super Admin'),

  // Applique les migrations au démarrage du conteneur.
  autoMigrate: optional('AUTO_MIGRATE', 'true') === 'true',
} as const;

export type Env = typeof env;
