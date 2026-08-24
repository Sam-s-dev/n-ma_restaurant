import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { closePool, pool } from './db/pool';
import { runMigrations } from './db/migrate';

async function main() {
  // Le conteneur applique lui-même les migrations au démarrage : un déploiement
  // Render suffit à mettre la base à jour, sans étape manuelle.
  if (env.autoMigrate) {
    await runMigrations();
  } else {
    await pool.query('SELECT 1');
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
