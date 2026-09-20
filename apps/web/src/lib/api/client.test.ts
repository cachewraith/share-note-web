import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchShare } from './client';

const share = {
  id: 'aaaaaaaaaaaaaaaaaaaaa',
  title: 'Note',
  markdown: '# Note',
  contentHash: 'a'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  assets: [],
};

function respond(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchShare', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = 'http://api.test';
    process.env.PUBLIC_API_URL = 'http://api.test';
    process.env.PUBLIC_WEB_URL = 'http://web.test';
    delete process.env.SHARE_CACHE_SECONDS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed share', async () => {
    fetchMock.mockResolvedValue(respond(200, share));
    await expect(fetchShare(share.id)).resolves.toMatchObject({ title: 'Note' });
  });

  it('calls the public route on the internal api url', async () => {
    fetchMock.mockResolvedValue(respond(200, share));
    await fetchShare(share.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`http://api.test/v1/public/shares/${share.id}`);
  });

  /**
   * The point of this test: caching the lookup means continuing to serve a note
   * after it was unshared, and "unshared means gone" is the promise the product
   * makes. Next's `revalidate` is stale-while-revalidate, so a cached lookup
   * outlives its own TTL.
   */
  it('does not cache the lookup by default, so unsharing takes effect at once', async () => {
    fetchMock.mockResolvedValue(respond(200, share));
    await fetchShare(share.id);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.cache).toBe('no-store');
    expect(init).not.toHaveProperty('next');
  });

  it('caches only when an operator opts in', async () => {
    process.env.SHARE_CACHE_SECONDS = '30';
    const { fetchShare: withCache } = await import('./client');

    fetchMock.mockResolvedValue(respond(200, share));
    await withCache(share.id);

    const init = fetchMock.mock.calls[0]?.[1] as { next?: { revalidate?: number } };
    expect(init.next?.revalidate).toBe(30);
  });

  it('returns null for a share that does not exist', async () => {
    fetchMock.mockResolvedValue(respond(404, { error: { code: 'NOT_FOUND', message: 'x' } }));
    await expect(fetchShare(share.id)).resolves.toBeNull();
  });

  it('returns null for a malformed id rather than throwing', async () => {
    fetchMock.mockResolvedValue(
      respond(400, { error: { code: 'VALIDATION_FAILED', message: 'x' } }),
    );
    await expect(fetchShare(share.id)).resolves.toBeNull();
  });

  it('throws when the api is unwell, so the page shows an error rather than a 404', async () => {
    fetchMock.mockResolvedValue(
      respond(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } }),
    );
    await expect(fetchShare(share.id)).rejects.toThrow(/503/);
  });

  it('throws when the payload does not match the contract', async () => {
    fetchMock.mockResolvedValue(respond(200, { id: 'nope' }));
    await expect(fetchShare(share.id)).rejects.toThrow(/contract/);
  });
});
