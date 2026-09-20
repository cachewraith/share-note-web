import 'reflect-metadata';
import 'dotenv/config';

import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { issueToken, pruneAssets } from './commands';

const USAGE = `
Usage: pnpm --filter @share-note/api cli <command> [options]
       node dist/cli/main.js <command> [options]        (inside the container)

Commands:
  issue-token   --share <id>
                Mint a new edit token for an existing share, replacing the one
                it had. For a share published before edit tokens existed, or
                one whose token was lost with the note that held it.

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
      share: { type: 'string' },
      'grace-hours': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });

  // No HTTP server: the CLI wants the same providers, not the same listeners.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    switch (command) {
      case 'issue-token':
        if (!values.share) return fail('issue-token needs --share');
        return await issueToken(app, { shareId: values.share });

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
