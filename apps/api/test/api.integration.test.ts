import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  type ApiError,
  type CreateAssetResponse,
  type CreateShareResponse,
  EDIT_TOKEN_HEADER,
  type PublicShareResponse,
  type ReadyResponse,
  ROUTES,
  type UpdateShareResponse,
} from '@share-note/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../src/infra/storage';
import { GIF_BYTES, integrationEnv, multipartBody, PNG_BYTES, waitForReady } from './harness';

let app: NestFastifyApplication;

const json = { 'content-type': 'application/json' };

/** A token that is well formed but belongs to no share. */
const WRONG_TOKEN = `snt_${'z'.repeat(43)}`;

function edit(token: string): Record<string, string> {
  return { [EDIT_TOKEN_HEADER]: token };
}

beforeAll(async () => {
  Object.assign(process.env, integrationEnv());
  ({ app } = await createApp());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await waitForReady(app);
}, 60_000);

afterAll(async () => {
  await app?.close();
});

async function createShare(
  body: { title: string; markdown: string } = { title: 'Note', markdown: '# Note' },
): Promise<CreateShareResponse> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.shares,
    headers: json,
    payload: body,
  });
  expect(response.statusCode).toBe(201);
  return response.json<CreateShareResponse>();
}

describe('health', () => {
  it('reports liveness without a key', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.health });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>()).toEqual({ status: 'ok' });
  });

  it('reports every dependency as up', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.ready });
    expect(response.statusCode).toBe(200);
    expect(response.json<ReadyResponse>()).toEqual({
      status: 'ready',
      checks: { database: 'up', redis: 'up', storage: 'up' },
    });
  });
});

describe('open publishing', () => {
  it('publishes with no credential of any kind', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shares,
      headers: json,
      payload: { title: 'Anyone', markdown: '# Anyone' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<CreateShareResponse>().editToken).toMatch(/^snt_[A-Za-z0-9_-]{43}$/);
  });

  it('ignores an Authorization header rather than refusing it', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shares,
      headers: { authorization: 'Bearer whatever', ...json },
      payload: { title: 'Note', markdown: '# Note' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('gives each share its own token', async () => {
    const [a, b] = await Promise.all([createShare(), createShare()]);
    expect(a.editToken).not.toBe(b.editToken);
  });

  it('never returns a token again after creation', async () => {
    const share = await createShare();

    const read = await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) });
    expect(read.body).not.toContain(share.editToken);

    const updated = await app.inject({
      method: 'PUT',
      url: ROUTES.share(share.id),
      headers: { ...edit(share.editToken), ...json },
      payload: { title: 'Note', markdown: '# Changed' },
    });
    expect(updated.body).not.toContain(share.editToken);
  });

  it('stores only a digest of the token', async () => {
    const share = await createShare();
    const row = await app
      .get(PrismaService)
      .share.findUniqueOrThrow({ where: { id: share.id }, select: { editTokenHash: true } });

    expect(row.editTokenHash).not.toBeNull();
    expect(row.editTokenHash).not.toContain(share.editToken.slice('snt_'.length));
  });
});

describe('shares', () => {
  it('creates a share and returns a link built from PUBLIC_WEB_URL', async () => {
    const share = await createShare();
    expect(share.url).toBe(`http://web.test/${share.id}`);
    expect(share.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  it('gives two shares different ids', async () => {
    const [a, b] = await Promise.all([createShare(), createShare()]);
    expect(a.id).not.toBe(b.id);
  });

  it('skips the write when the content is unchanged', async () => {
    const share = await createShare({ title: 'Same', markdown: 'body' });
    const before = await app
      .get(PrismaService)
      .share.findUniqueOrThrow({ where: { id: share.id }, select: { updatedAt: true } });

    const response = await app.inject({
      method: 'PUT',
      url: ROUTES.share(share.id),
      headers: { ...edit(share.editToken), ...json },
      payload: { title: 'Same', markdown: 'body' },
    });

    expect(response.json<UpdateShareResponse>().updated).toBe(false);
    const after = await app
      .get(PrismaService)
      .share.findUniqueOrThrow({ where: { id: share.id }, select: { updatedAt: true } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('keeps the url stable across an update', async () => {
    const share = await createShare();
    const response = await app.inject({
      method: 'PUT',
      url: ROUTES.share(share.id),
      headers: { ...edit(share.editToken), ...json },
      payload: { title: 'Note', markdown: '# Changed' },
    });

    expect(response.json<UpdateShareResponse>()).toMatchObject({
      id: share.id,
      url: share.url,
      updated: true,
    });
  });

  it.each([
    ['an empty title', { title: '', markdown: 'x' }],
    ['a whitespace title', { title: '   ', markdown: 'x' }],
    ['a missing title', { markdown: 'x' }],
    ['a missing markdown', { title: 'x' }],
    ['a non-string markdown', { title: 'x', markdown: 42 }],
  ])('refuses %s', async (_label, payload) => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shares,
      headers: json,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ApiError>().error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses markdown over the limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shares,
      headers: json,
      payload: { title: 'Big', markdown: 'a'.repeat(1_048_577) },
    });
    expect([400, 413]).toContain(response.statusCode);
  });

  it('refuses an id that is not a public id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/shares/../../etc/passwd',
      headers: { ...edit(WRONG_TOKEN), ...json },
      payload: { title: 'x', markdown: 'y' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('edit tokens', () => {
  it('refuses an update from someone holding only the public link', async () => {
    const share = await createShare();
    const response = await app.inject({
      method: 'PUT',
      url: ROUTES.share(share.id),
      headers: json,
      payload: { title: 'hijacked', markdown: 'x' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiError>().error.code).toBe('NOT_FOUND');
  });

  it("refuses an update presenting another share's token", async () => {
    const [mine, theirs] = await Promise.all([createShare(), createShare()]);
    const response = await app.inject({
      method: 'PUT',
      url: ROUTES.share(mine.id),
      headers: { ...edit(theirs.editToken), ...json },
      payload: { title: 'hijacked', markdown: 'x' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses a delete from someone holding only the public link', async () => {
    const share = await createShare();
    const response = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: edit(WRONG_TOKEN),
    });

    expect(response.statusCode).toBe(404);
    const stillThere = await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) });
    expect(stillThere.statusCode).toBe(200);
  });

  it('refuses to attach to a share whose token the caller does not hold', async () => {
    const share = await createShare();
    const body = multipartBody('file', 'a.png', PNG_BYTES, 'image/png');

    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shareAssets(share.id),
      headers: { ...edit(WRONG_TOKEN), ...body.headers },
      payload: body.payload,
    });

    expect(response.statusCode).toBe(404);
  });

  it.each([
    ['a malformed token', 'not-a-token'],
    ['an empty token', ''],
    ['the right shape but wrong secret', `snt_${'q'.repeat(43)}`],
  ])('refuses %s', async (_label, token) => {
    const share = await createShare();
    const response = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: edit(token),
    });
    expect(response.statusCode).toBe(404);
  });

  it('accepts the share own token', async () => {
    const share = await createShare();
    const response = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: edit(share.editToken),
    });
    expect(response.statusCode).toBe(204);
  });
});

describe('public reads', () => {
  it('serves a share to anyone, with no token in the body', async () => {
    const share = await createShare({ title: 'Public', markdown: '# Public' });
    const response = await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json<PublicShareResponse>()).toMatchObject({ id: share.id, title: 'Public' });
    expect(response.body).not.toContain('ownerId');
    expect(response.body).not.toContain('editToken');
    expect(response.body).not.toContain(share.editToken);
  });

  it('asks robots not to index a shared note', async () => {
    const share = await createShare();
    const response = await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) });
    expect(response.headers['x-robots-tag']).toContain('noindex');
  });

  it('answers NOT_FOUND for an id that never existed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.publicShare('aaaaaaaaaaaaaaaaaaaaa'),
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses a malformed id', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/public/shares/short' });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('attachments', () => {
  async function upload(
    share: CreateShareResponse,
    filename: string,
    bytes: Buffer,
    contentType = 'image/png',
  ) {
    const body = multipartBody('file', filename, bytes, contentType);
    return app.inject({
      method: 'POST',
      url: ROUTES.shareAssets(share.id),
      headers: { ...edit(share.editToken), ...body.headers },
      payload: body.payload,
    });
  }

  it('stores an image and serves it back byte for byte', async () => {
    const share = await createShare();
    const created = await upload(share, 'pixel.png', PNG_BYTES);
    expect(created.statusCode).toBe(201);

    const asset = created.json<CreateAssetResponse>();
    const served = await app.inject({ method: 'GET', url: ROUTES.publicAsset(asset.id) });

    expect(served.statusCode).toBe(200);
    expect(served.rawPayload.equals(PNG_BYTES)).toBe(true);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toContain('immutable');
  });

  it('is idempotent for the same bytes under the same name', async () => {
    const share = await createShare();
    const first = await upload(share, 'pixel.png', PNG_BYTES);
    const second = await upload(share, 'pixel.png', PNG_BYTES);

    expect(first.json<CreateAssetResponse>().created).toBe(true);
    expect(second.json<CreateAssetResponse>().created).toBe(false);
    expect(second.json<CreateAssetResponse>().id).toBe(first.json<CreateAssetResponse>().id);
  });

  it('mints a new id when the same name gets different bytes', async () => {
    const share = await createShare();
    const first = await upload(share, 'pixel.png', PNG_BYTES);
    const second = await upload(share, 'pixel.png', GIF_BYTES, 'image/gif');

    expect(second.json<CreateAssetResponse>().id).not.toBe(first.json<CreateAssetResponse>().id);

    const stale = await app.inject({
      method: 'GET',
      url: ROUTES.publicAsset(first.json<CreateAssetResponse>().id),
    });
    expect(stale.statusCode).toBe(404);
  });

  it('trusts the magic bytes over the declared type', async () => {
    const share = await createShare();
    const response = await upload(share, 'looks-like.png', GIF_BYTES, 'image/png');
    expect(response.json<CreateAssetResponse>().mime).toBe('image/gif');
  });

  it('refuses an svg dressed as a png', async () => {
    const share = await createShare();
    const response = await upload(
      share,
      'logo.png',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      'image/png',
    );

    expect(response.statusCode).toBe(415);
    expect(response.json<ApiError>().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('refuses html', async () => {
    const share = await createShare();
    const response = await upload(
      share,
      'page.png',
      Buffer.from('<html><script>alert(1)</script></html>'),
    );
    expect(response.statusCode).toBe(415);
  });

  it('cannot be made to write outside its own share prefix', async () => {
    const share = await createShare();
    const response = await upload(share, '../../escape.png', PNG_BYTES);

    // The multipart parser already strips the directory part, and the storage
    // key is built from ids rather than the name, so neither layer can be
    // steered by the filename. `validateFilename` covers the rest (see its
    // unit tests) for any path that does not go through the parser.
    const created = response.json<CreateAssetResponse>();
    expect(response.statusCode).toBe(201);
    expect(created.filename).not.toContain('/');

    const stored = await app
      .get(PrismaService)
      .asset.findUniqueOrThrow({ where: { id: created.id }, select: { storageKey: true } });
    expect(stored.storageKey.startsWith(`shares/${share.id}/`)).toBe(true);
    expect(stored.storageKey).not.toContain('..');
  });

  it('lists its attachments on the public share', async () => {
    const share = await createShare({ title: 'With image', markdown: '![[pixel.png]]' });
    await upload(share, 'pixel.png', PNG_BYTES);

    const response = await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) });
    const assets = response.json<PublicShareResponse>().assets;
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ filename: 'pixel.png', mime: 'image/png' });
  });

  it('rejects a body that is not multipart', async () => {
    const share = await createShare();
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shareAssets(share.id),
      headers: { ...edit(share.editToken), ...json },
      payload: { file: 'nope' },
    });
    expect(response.statusCode).toBe(415);
  });
});

describe('unshare', () => {
  it('removes the share, its attachments and the stored objects', async () => {
    const share = await createShare({ title: 'Doomed', markdown: '![[pixel.png]]' });
    const body = multipartBody('file', 'pixel.png', PNG_BYTES, 'image/png');
    const asset = (
      await app.inject({
        method: 'POST',
        url: ROUTES.shareAssets(share.id),
        headers: { ...edit(share.editToken), ...body.headers },
        payload: body.payload,
      })
    ).json<CreateAssetResponse>();

    const storage = app.get<StoragePort>(STORAGE_PORT);
    expect(await storage.get(`shares/${share.id}/${asset.id}.png`)).not.toBeNull();

    const deleted = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: edit(share.editToken),
    });
    expect(deleted.statusCode).toBe(204);

    expect(
      (await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: ROUTES.publicAsset(asset.id) })).statusCode,
    ).toBe(404);
    expect(await storage.get(`shares/${share.id}/${asset.id}.png`)).toBeNull();
    expect(await app.get(PrismaService).asset.findUnique({ where: { id: asset.id } })).toBeNull();
  });

  it('answers NOT_FOUND when unsharing twice', async () => {
    const share = await createShare();
    await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: edit(share.editToken),
    });
    const second = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: edit(share.editToken),
    });
    expect(second.statusCode).toBe(404);
  });
});

describe('response headers', () => {
  it('sets the security headers helmet is configured for', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.health });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('reports the remaining rate limit budget', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.publicShare('aaaaaaaaaaaaaaaaaaaaa'),
    });
    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.headers['ratelimit-remaining']).toBeDefined();
  });
});
