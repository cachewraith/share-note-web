import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Logger } from '@nestjs/common';
import { loadConfig } from '../../config';

const execFileAsync = promisify(execFile);

/**
 * Applies pending migrations during bootstrap when RUN_MIGRATIONS_ON_START is
 * set. Intended for development and single-process deployments.
 *
 * The published API image does **not** contain the Prisma CLI — it is over
 * 200 MB of tooling a serving process never uses — so this refuses with a
 * message naming the migrate image rather than failing obscurely. Container
 * deployments run migrations as a job instead; see docs/decisions/0014 and
 * docker-compose.prod.example.yml.
 *
 * It shells out to the Prisma CLI rather than reimplementing the migration
 * engine, and refuses to start if a migration fails: booting against a schema
 * the code does not expect is worse than not booting.
 */
export async function runMigrationsIfConfigured(): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.runMigrationsOnStart) return;

  const logger = new Logger('migrate');

  let cliPath: string;
  try {
    cliPath = require.resolve('prisma/build/index.js');
  } catch {
    throw new Error(
      'RUN_MIGRATIONS_ON_START is set but the Prisma CLI is not installed. ' +
        'In a container, run migrations with the `migrate` image ' +
        '(docker build --target migrate) before starting the API, and leave ' +
        'RUN_MIGRATIONS_ON_START unset.',
    );
  }

  logger.log('applying pending migrations');
  const { stdout } = await execFileAsync(process.execPath, [cliPath, 'migrate', 'deploy'], {
    env: process.env,
  });
  logger.log(stdout.trim());
}
