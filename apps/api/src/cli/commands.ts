import { Logger } from '@nestjs/common';
import { generateApiKey } from '../common/ids';
import { AuthRepository } from '../modules/auth/auth.repository';
import { AssetRepository } from '../modules/assets/asset.repository';
import { STORAGE_PORT, type StoragePort } from '../infra/storage';
import { type INestApplicationContext } from '@nestjs/common';

/**
 * An object an operator has to read, so it is written for a terminal rather
 * than piped through the logger.
 */
function printKey(key: string, context: { userId: string; keyName: string }): void {
  process.stdout.write(
    [
      '',
      '  API key created. It is shown once and cannot be recovered.',
      '',
      `    user:  ${context.userId}`,
      `    name:  ${context.keyName}`,
      `    key:   ${key}`,
      '',
      '  Paste it into the Obsidian plugin settings.',
      '',
      '',
    ].join('\n'),
  );
}

export async function createUser(
  app: INestApplicationContext,
  options: { email: string | null; keyName: string },
): Promise<number> {
  const repository = app.get(AuthRepository);

  if (options.email) {
    const existing = await repository.findUserByEmail(options.email);
    if (existing) {
      process.stderr.write(
        `A user with that email already exists. Use "create-key --email" to add a key to it.\n`,
      );
      return 1;
    }
  }

  const generated = generateApiKey();
  const { userId } = await repository.createUserWithKey({
    email: options.email,
    keyName: options.keyName,
    prefix: generated.prefix,
    keyHash: generated.keyHash,
  });

  printKey(generated.key, { userId, keyName: options.keyName });
  return 0;
}

export async function createKey(
  app: INestApplicationContext,
  options: { email: string; keyName: string },
): Promise<number> {
  const repository = app.get(AuthRepository);
  const user = await repository.findUserByEmail(options.email);
  if (!user) {
    process.stderr.write('No user with that email.\n');
    return 1;
  }

  const generated = generateApiKey();
  await repository.createKeyForUser({
    userId: user.id,
    keyName: options.keyName,
    prefix: generated.prefix,
    keyHash: generated.keyHash,
  });

  printKey(generated.key, { userId: user.id, keyName: options.keyName });
  return 0;
}

export async function revokeKey(
  app: INestApplicationContext,
  options: { prefix: string },
): Promise<number> {
  const revoked = await app.get(AuthRepository).revokeKeyByPrefix(options.prefix, new Date());
  if (!revoked) {
    process.stderr.write('No active key with that prefix.\n');
    return 1;
  }
  process.stdout.write(`Revoked key ${options.prefix}.\n`);
  return 0;
}

/**
 * Deletes objects the database does not reference.
 *
 * These appear when an upload stores its bytes and then fails before the row is
 * written, or when a share is deleted and the bucket call fails afterwards (see
 * docs/decisions/0008). Objects younger than the grace period are left alone:
 * an upload in flight has an object but not yet a row, and deleting it would
 * turn a healthy request into a broken image.
 */
export async function pruneAssets(
  app: INestApplicationContext,
  options: { graceHours: number; dryRun: boolean },
): Promise<number> {
  const logger = new Logger('prune-assets');
  const storage = app.get<StoragePort>(STORAGE_PORT);
  const known = await app.get(AssetRepository).allStorageKeys();

  const cutoff = new Date(Date.now() - options.graceHours * 3_600_000);
  const objects = await storage.list('shares/');
  const orphans = objects.filter(
    (object) => !known.has(object.key) && object.lastModified < cutoff,
  );

  const bytes = orphans.reduce((total, object) => total + object.size, 0);
  logger.log(
    `${String(objects.length)} objects, ${String(orphans.length)} orphaned (${String(bytes)} bytes)`,
  );

  if (orphans.length === 0) return 0;
  if (options.dryRun) {
    for (const orphan of orphans) logger.log(`would delete ${orphan.key}`);
    return 0;
  }

  await storage.delete(orphans.map((orphan) => orphan.key));
  logger.log(`deleted ${String(orphans.length)} orphaned objects`);
  return 0;
}
