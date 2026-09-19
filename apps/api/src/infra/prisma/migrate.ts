import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Logger } from '@nestjs/common';
import { loadConfig } from '../../config';

const execFileAsync = promisify(execFile);

/**
 * Applies pending migrations at container start when RUN_MIGRATIONS_ON_START is
 * set, which is how the Docker image is meant to run. Migrations are required
 * to be backward compatible for one release (see docs/releasing.md), so a rolling
 * deploy where old and new pods overlap is safe.
 *
 * It shells out to the Prisma CLI rather than reimplementing the migration
 * engine, and refuses to start if a migration fails: booting against a schema
 * the code does not expect is worse than not booting.
 */
export async function runMigrationsIfConfigured(): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.runMigrationsOnStart) return;

  const logger = new Logger('migrate');
  logger.log('applying pending migrations');

  const { stdout } = await execFileAsync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    { env: process.env },
  );
  logger.log(stdout.trim());
}
