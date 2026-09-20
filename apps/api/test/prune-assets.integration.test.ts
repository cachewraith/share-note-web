import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type CreateAssetResponse, type CreateShareResponse, ROUTES } from '@share-note/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap';
import { pruneAssets } from '../src/cli/commands';
import { STORAGE_PORT, type StoragePort } from '../src/infra/storage';
import { EDIT_TOKEN_HEADER } from '@share-note/contracts';
import { checksumFor, integrationEnv, multipartBody, PNG_BYTES, waitForReady } from './harness';

let app: NestFastifyApplication;
let storage: StoragePort;

beforeAll(async () => {
  Object.assign(process.env, integrationEnv());
  ({ app } = await createApp());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await waitForReady(app);
  storage = app.get<StoragePort>(STORAGE_PORT);
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('prune-assets', () => {
  const orphanKey = 'shares/orphaned-share/orphan.png';

  it('leaves referenced objects alone', async () => {
    const share = await app
      .inject({
        method: 'POST',
        url: ROUTES.shares,
        headers: { 'content-type': 'application/json' },
        payload: { title: 'Keep me', markdown: '![[pixel.png]]' },
      })
      .then((response) => response.json<CreateShareResponse>());

    const body = multipartBody('file', 'pixel.png', PNG_BYTES, 'image/png');
    const asset = await app
      .inject({
        method: 'POST',
        url: ROUTES.shareAssets(share.id),
        headers: { [EDIT_TOKEN_HEADER]: share.editToken, ...body.headers },
        payload: body.payload,
      })
      .then((response) => response.json<CreateAssetResponse>());

    // Grace period of 0 so the freshly written object is eligible if it is
    // orphaned; it is not, so it must survive.
    await pruneAssets(app, { graceHours: 0, dryRun: false });

    expect(await storage.get(`shares/${share.id}/${asset.id}.png`)).not.toBeNull();
  });

  it('deletes an object no row references', async () => {
    await storage.put({
      key: orphanKey,
      body: PNG_BYTES,
      contentType: 'image/png',
      checksumSha256: checksumFor(PNG_BYTES),
    });
    expect(await storage.get(orphanKey)).not.toBeNull();

    await pruneAssets(app, { graceHours: 0, dryRun: false });

    expect(await storage.get(orphanKey)).toBeNull();
  });

  it('spares an orphan that is younger than the grace period', async () => {
    await storage.put({
      key: orphanKey,
      body: PNG_BYTES,
      contentType: 'image/png',
      checksumSha256: checksumFor(PNG_BYTES),
    });

    await pruneAssets(app, { graceHours: 24, dryRun: false });

    expect(await storage.get(orphanKey)).not.toBeNull();
    await storage.delete([orphanKey]);
  });

  it('changes nothing on a dry run', async () => {
    await storage.put({
      key: orphanKey,
      body: PNG_BYTES,
      contentType: 'image/png',
      checksumSha256: checksumFor(PNG_BYTES),
    });

    await pruneAssets(app, { graceHours: 0, dryRun: true });

    expect(await storage.get(orphanKey)).not.toBeNull();
    await storage.delete([orphanKey]);
  });
});
