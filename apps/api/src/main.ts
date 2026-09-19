import 'reflect-metadata';
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { bootstrap } from './bootstrap';
import { runMigrationsIfConfigured } from './infra/prisma/migrate';

async function main(): Promise<void> {
  await runMigrationsIfConfigured();
  await bootstrap();
}

main().catch((error: unknown) => {
  // The config loader's message names the offending variables and nothing else,
  // so it is safe to print; anything else is logged with its stack.
  new Logger('bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
