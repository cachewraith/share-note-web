import { Logger } from '@nestjs/common';
import { generateEditToken } from '../common/ids';
import { AssetRepository } from '../modules/assets/asset.repository';
import { ShareRepository } from '../modules/shares/share.repository';
import { STORAGE_PORT, type StoragePort } from '../infra/storage';
import { type INestApplicationContext } from '@nestjs/common';

/**
 * Mints a fresh edit token for an existing share, replacing whatever token it
 * had.
 *
 * Two situations need this. A share created before this release has no token at
 * all and cannot otherwise be updated or unshared; and an author who lost the
 * token — deleted the note, or the frontmatter it lived in — would otherwise
 * have a note published at a link they can no longer take down.
 *
 * Issuing a token invalidates the previous one, so running this on a share
 * whose token is still in a vault will stop that vault from updating it.
 */
export async function issueToken(
  app: INestApplicationContext,
  options: { shareId: string },
): Promise<number> {
  const generated = generateEditToken();
  const share = await app
    .get(ShareRepository)
    .setEditTokenHash(options.shareId, generated.tokenHash);

  if (!share) {
    process.stderr.write('No such share.\n');
    return 1;
  }

  process.stdout.write(
    [
      '',
      '  Edit token issued. It is shown once and cannot be recovered.',
      '',
      `    share:  ${share.id}`,
      `    title:  ${share.title}`,
      `    token:  ${generated.token}`,
      '',
      '  Any token this share had before is now invalid.',
      '',
      '',
    ].join('\n'),
  );
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
