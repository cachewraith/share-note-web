import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  type ApiError,
  type CreateAssetResponse,
  type CreateShareResponse,
  type ListSharesResponse,
  type MeResponse,
  type PublicShareResponse,
  type ReadyResponse,
  ROUTES,
  type UpdateShareResponse,
} from '@share-note/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../src/infra/storage';
import { GIF_BYTES, integrationEnv, multipartBody, PNG_BYTES, seedUser } from './harness';

let app: NestFastifyApplication;
let key: string;
let otherKey: string;

const json = { 'content-type': 'application/json' };

function auth(token = key): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  Object.assign(process.env, integrationEnv());
  ({ app } = await createApp());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  ({ key } = await seedUser(app));
  ({ key: otherKey } = await seedUser(app));
}, 60_000);

afterAll(async () => {
  await app?.close();
});

async function createShare(
  body: { title: string; markdown: string } = { title: 'Note', markdown: '# Note' },
  token = key,
): Promise<CreateShareResponse> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.shares,
    headers: { ...auth(token), ...json },
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

describe('authentication', () => {
  it('refuses a request with no key', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.me });
    expect(response.statusCode).toBe(401);
    expect(response.json<ApiError>().error.code).toBe('UNAUTHORIZED');
  });

  it.each([
    ['a malformed key', 'not-a-key'],
    ['the right shape but wrong secret', `snw_aaaaaaaa_${'a'.repeat(43)}`],
    ['an empty bearer token', ''],
  ])('refuses %s', async (_label, token) => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.me,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a key presented without the Bearer scheme', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.me,
      headers: { authorization: key },
    });
    expect(response.statusCode).toBe(401);
  });

  it('identifies the caller behind a valid key', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.me, headers: auth() });
    expect(response.statusCode).toBe(200);
    expect(response.json<MeResponse>()).toMatchObject({ apiKey: { name: 'test' } });
  });

  it('never returns the key or its hash', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.me, headers: auth() });
    expect(response.body).not.toContain(key);
    expect(response.body).not.toContain('keyHash');
  });

  it('refuses a revoked key', async () => {
    const { key: doomed } = await seedUser(app);
    const prefix = doomed.slice('snw_'.length, 'snw_'.length + 8);
    await app.get(PrismaService).apiKey.update({
      where: { prefix },
      data: { revokedAt: new Date() },
    });

    const response = await app.inject({
      method: 'GET',
      url: ROUTES.me,
      headers: auth(doomed),
    });
    expect(response.statusCode).toBe(401);
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
      headers: { ...auth(), ...json },
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
      headers: { ...auth(), ...json },
      payload: { title: 'Note', markdown: '# Changed' },
    });

    expect(response.json<UpdateShareResponse>()).toMatchObject({
      id: share.id,
      url: share.url,
      updated: true,
    });
  });

  it('lists only the caller own shares', async () => {
    const mine = await createShare({ title: 'Mine', markdown: 'x' });
    await createShare({ title: 'Theirs', markdown: 'y' }, otherKey);

    const response = await app.inject({
      method: 'GET',
      url: `${ROUTES.shares}?limit=200`,
      headers: auth(),
    });
    const listed = response.json<ListSharesResponse>().shares;

    expect(listed.map((share) => share.id)).toContain(mine.id);
    expect(listed.every((share) => share.title !== 'Theirs')).toBe(true);
  });

  it('paginates with a cursor', async () => {
    await Promise.all([createShare(), createShare(), createShare()]);

    const first = await app.inject({
      method: 'GET',
      url: `${ROUTES.shares}?limit=2`,
      headers: auth(),
    });
    const firstPage = first.json<ListSharesResponse>();
    expect(firstPage.shares).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const second = await app.inject({
      method: 'GET',
      url: `${ROUTES.shares}?limit=2&cursor=${String(firstPage.nextCursor)}`,
      headers: auth(),
    });
    const firstIds = firstPage.shares.map((share) => share.id);
    const secondIds = second.json<ListSharesResponse>().shares.map((share) => share.id);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
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
      headers: { ...auth(), ...json },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ApiError>().error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses markdown over the limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shares,
      headers: { ...auth(), ...json },
      payload: { title: 'Big', markdown: 'a'.repeat(1_048_577) },
    });
    expect([400, 413]).toContain(response.statusCode);
  });

  it('refuses an id that is not a public id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/shares/../../etc/passwd',
      headers: { ...auth(), ...json },
      payload: { title: 'x', markdown: 'y' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('ownership', () => {
  it("hides another owner's share behind NOT_FOUND on update", async () => {
    const share = await createShare();
    const response = await app.inject({
      method: 'PUT',
      url: ROUTES.share(share.id),
      headers: { ...auth(otherKey), ...json },
      payload: { title: 'hijacked', markdown: 'x' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiError>().error.code).toBe('NOT_FOUND');
  });

  it("hides another owner's share behind NOT_FOUND on delete", async () => {
    const share = await createShare();
    const response = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: auth(otherKey),
    });

    expect(response.statusCode).toBe(404);
    const stillThere = await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) });
    expect(stillThere.statusCode).toBe(200);
  });

  it("refuses to attach to another owner's share", async () => {
    const share = await createShare();
    const body = multipartBody('file', 'a.png', PNG_BYTES, 'image/png');

    const response = await app.inject({
      method: 'POST',
      url: ROUTES.shareAssets(share.id),
      headers: { ...auth(otherKey), ...body.headers },
      payload: body.payload,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('public reads', () => {
  it('serves a share with no key and no owner information', async () => {
    const share = await createShare({ title: 'Public', markdown: '# Public' });
    const response = await app.inject({ method: 'GET', url: ROUTES.publicShare(share.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json<PublicShareResponse>()).toMatchObject({ id: share.id, title: 'Public' });
    expect(response.body).not.toContain('ownerId');
    expect(response.body).not.toContain('@test.invalid');
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
    shareId: string,
    filename: string,
    bytes: Buffer,
    contentType = 'image/png',
    token = key,
  ) {
    const body = multipartBody('file', filename, bytes, contentType);
    return app.inject({
      method: 'POST',
      url: ROUTES.shareAssets(shareId),
      headers: { ...auth(token), ...body.headers },
      payload: body.payload,
    });
  }

  it('stores an image and serves it back byte for byte', async () => {
    const share = await createShare();
    const created = await upload(share.id, 'pixel.png', PNG_BYTES);
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
    const first = await upload(share.id, 'pixel.png', PNG_BYTES);
    const second = await upload(share.id, 'pixel.png', PNG_BYTES);

    expect(first.json<CreateAssetResponse>().created).toBe(true);
    expect(second.json<CreateAssetResponse>().created).toBe(false);
    expect(second.json<CreateAssetResponse>().id).toBe(first.json<CreateAssetResponse>().id);
  });

  it('mints a new id when the same name gets different bytes', async () => {
    const share = await createShare();
    const first = await upload(share.id, 'pixel.png', PNG_BYTES);
    const second = await upload(share.id, 'pixel.png', GIF_BYTES, 'image/gif');

    expect(second.json<CreateAssetResponse>().id).not.toBe(first.json<CreateAssetResponse>().id);

    const stale = await app.inject({
      method: 'GET',
      url: ROUTES.publicAsset(first.json<CreateAssetResponse>().id),
    });
    expect(stale.statusCode).toBe(404);
  });

  it('trusts the magic bytes over the declared type', async () => {
    const share = await createShare();
    const response = await upload(share.id, 'looks-like.png', GIF_BYTES, 'image/png');
    expect(response.json<CreateAssetResponse>().mime).toBe('image/gif');
  });

  it('refuses an svg dressed as a png', async () => {
    const share = await createShare();
    const response = await upload(
      share.id,
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
      share.id,
      'page.png',
      Buffer.from('<html><script>alert(1)</script></html>'),
    );
    expect(response.statusCode).toBe(415);
  });

  it('cannot be made to write outside its own share prefix', async () => {
    const share = await createShare();
    const response = await upload(share.id, '../../escape.png', PNG_BYTES);

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
    await upload(share.id, 'pixel.png', PNG_BYTES);

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
      headers: { ...auth(), ...json },
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
        headers: { ...auth(), ...body.headers },
        payload: body.payload,
      })
    ).json<CreateAssetResponse>();

    const storage = app.get<StoragePort>(STORAGE_PORT);
    expect(await storage.get(`shares/${share.id}/${asset.id}.png`)).not.toBeNull();

    const deleted = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: auth(),
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
    await app.inject({ method: 'DELETE', url: ROUTES.share(share.id), headers: auth() });
    const second = await app.inject({
      method: 'DELETE',
      url: ROUTES.share(share.id),
      headers: auth(),
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
    const response = await app.inject({ method: 'GET', url: ROUTES.me, headers: auth() });
    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.headers['ratelimit-remaining']).toBeDefined();
  });
});
