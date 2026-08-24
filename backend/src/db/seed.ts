import { env } from '../config/env';
import { logger } from '../config/logger';
import { closePool, query, queryOne } from './pool';
import { hashPassword } from '../utils/password';

/**
 * Crée (ou met à jour) le compte Super Admin à partir des variables
 * SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD. Idempotent : peut être
 * relancé sans risque à chaque déploiement.
 */
export async function seedSuperAdmin(): Promise<void> {
  const email = env.seedSuperAdminEmail;
  const password = env.seedSuperAdminPassword;

  if (!email || !password) {
    logger.warn(
      'SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD absents : aucun compte Super Admin créé.',
    );
    return;
  }
  if (password.length < 10) {
    throw new Error('SEED_SUPERADMIN_PASSWORD doit contenir au moins 10 caractères.');
  }

  const passwordHash = await hashPassword(password);
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM super_admins WHERE email = $1',
    [email],
  );

  if (existing) {
    await query(
      'UPDATE super_admins SET password_hash = $1, full_name = $2, is_active = true WHERE id = $3',
      [passwordHash, env.seedSuperAdminName, existing.id],
    );
    logger.info({ email }, 'compte Super Admin mis à jour');
    return;
  }

  await query(
    'INSERT INTO super_admins (email, password_hash, full_name) VALUES ($1, $2, $3)',
    [email, passwordHash, env.seedSuperAdminName],
  );
  logger.info({ email }, 'compte Super Admin créé');
}

if (require.main === module) {
  seedSuperAdmin()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error({ err: error }, 'seed en échec');
      process.exit(1);
    });
}
