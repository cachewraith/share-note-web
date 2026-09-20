import 'reflect-metadata';
import 'dotenv/config';

import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { createKey, createUser, pruneAssets, revokeKey } from './commands';

const USAGE = `
Usage: pnpm --filter @share-note/api cli <command> [options]
       node dist/cli/main.js <command> [options]        (inside the container)

Commands:
  create-user   [--email <address>] [--key-name <name>]
                Create a user and print its first API key.

  create-key    --email <address> [--key-name <name>]
                Add another API key to an existing user.

  revoke-key    --prefix <prefix>
                Revoke a key by the prefix shown in its id.

  prune-assets  [--grace-hours <n>] [--dry-run]
                Delete stored objects the database no longer references.
                Default grace period: 24 hours.
`;

async function main(): Promise<number> {
  const [command, ...argv] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: 'string' },
      'key-name': { type: 'string' },
      prefix: { type: 'string' },
      'grace-hours': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });

  // No HTTP server: the CLI wants the same providers, not the same listeners.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    switch (command) {
      case 'create-user':
        return await createUser(app, {
          email: values.email ?? null,
          keyName: values['key-name'] ?? 'obsidian',
        });

      case 'create-key':
        if (!values.email) return fail('create-key needs --email');
        return await createKey(app, {
          email: values.email,
          keyName: values['key-name'] ?? 'obsidian',
        });

      case 'revoke-key':
        if (!values.prefix) return fail('revoke-key needs --prefix');
        return await revokeKey(app, { prefix: values.prefix });

      case 'prune-assets':
        return await pruneAssets(app, {
          graceHours: Number(values['grace-hours'] ?? 24),
          dryRun: values['dry-run'],
        });

      default:
        return fail(`Unknown command "${command}".${USAGE}`);
    }
  } finally {
    await app.close();
  }
}

function fail(message: string): number {
  process.stderr.write(`${message}\n`);
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
