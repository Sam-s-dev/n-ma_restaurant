import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pool, closePool } from './pool';
import { logger } from '../config/logger';

/**
 * Applique les fichiers de `database/migrations` dans l'ordre alphabétique.
 * Chaque fichier est joué une seule fois, dans sa propre transaction, et
 * enregistré dans `schema_migrations` avec le hash de son contenu : si un
 * fichier déjà appliqué est modifié, la migration échoue au lieu de diverger
 * silencieusement entre les environnements.
 */

function resolveMigrationsDir(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    resolve(__dirname, '../../../database/migrations'), // dépôt local (src ou dist)
    resolve(__dirname, '../../database/migrations'),
    '/app/database/migrations', // image Docker
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Dossier de migrations introuvable. Chemins testés : ${candidates.join(', ')}`,
  );
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function runMigrations(): Promise<void> {
  const dir = resolveMigrationsDir();
  await ensureMigrationsTable();

  const applied = new Map<string, string>();
  const { rows } = await pool.query<{ filename: string; checksum: string }>(
    'SELECT filename, checksum FROM schema_migrations',
  );
  for (const row of rows) applied.set(row.filename, row.checksum);

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const filename of files) {
    const sql = readFileSync(join(dir, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(filename);

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `La migration ${filename} a été modifiée après avoir été appliquée. ` +
            'Créez un nouveau fichier de migration au lieu de modifier celui-ci.',
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
      await client.query('COMMIT');
      logger.info({ filename }, 'migration appliquée');
      count += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(
        `Échec de la migration ${filename} : ${(error as Error).message}`,
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  logger.info({ applied: count, total: files.length }, 'migrations à jour');
}

if (require.main === module) {
  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error({ err: error }, 'migrations en échec');
      process.exit(1);
    });
}
