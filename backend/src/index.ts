import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { closePool, pool } from './db/pool';
import { runMigrations } from './db/migrate';
import { seedSuperAdmin } from './db/seed';

async function main() {
  // Le conteneur applique lui-même les migrations au démarrage : un déploiement
  // Render suffit à mettre la base à jour, sans étape manuelle.
  if (env.autoMigrate) {
    await runMigrations();
  } else {
    await pool.query('SELECT 1');
  }

  // Compte Super Admin créé au démarrage si les variables sont fournies.
  // L'opération est idempotente, et c'est le seul moyen d'initialiser le
  // compte sur un hébergement sans accès shell (plan gratuit de Render).
  if (env.seedSuperAdminEmail && env.seedSuperAdminPassword) {
    await seedSuperAdmin().catch((error) => {
      // Un échec du seed ne doit pas empêcher l'API de démarrer.
      logger.error({ err: error }, 'création du compte Super Admin impossible');
    });
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv },
      'API de gestion de restaurant démarrée',
    );
  });

  // Arrêt propre : Render envoie SIGTERM avant de remplacer une instance.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'arrêt en cours');
    server.close(async () => {
      await closePool().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ err: error }, 'démarrage impossible');
  process.exit(1);
});
