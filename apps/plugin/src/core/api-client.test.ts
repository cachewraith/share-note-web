import { EDIT_TOKEN_HEADER, ROUTES } from '@share-note/contracts/lite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareApiClient } from './api-client';
import { ShareApiError } from './errors';
import type { HttpRequest, HttpResponse } from './http';

const SHARE_ID = 'aaaaaaaaaaaaaaaaaaaaa';
const ASSET_ID = 'bbbbbbbbbbbbbbbbbbbbb';
const TOKEN = `snt_${'a'.repeat(43)}`;

const shareResponse = {
  id: SHARE_ID,
  url: 'https://notes.example.com/aaaaaaaaaaaaaaaaaaaaa',
  contentHash: 'f'.repeat(64),
  editToken: TOKEN,
};

/** An update echoes no token back. */
const updateResponse = {
  id: SHARE_ID,
  url: 'https://notes.example.com/aaaaaaaaaaaaaaaaaaaaa',
  contentHash: 'f'.repeat(64),
  updated: true,
};

const readyResponse = {
  status: 'ready',
  checks: { database: 'up', redis: 'up', storage: 'up' },
};

const assetResponse = {
  id: ASSET_ID,
  url: `https://api.example.com/v1/public/assets/${ASSET_ID}`,
  filename: 'a.png',
  mime: 'image/png',
  size: 4,
  sha256: 'e'.repeat(64),
  created: true,
};

describe('ShareApiClient', () => {
  const transport = vi.fn<(request: HttpRequest) => Promise<HttpResponse>>();
  const client = new ShareApiClient(transport, {
    serverUrl: 'https://notes.example.com',
  });

  const reply = (status: number, body: unknown) => {
    transport.mockResolvedValue({ status, text: JSON.stringify(body) });
  };

  /** The JSON body of the nth request, as an object. */
  const sentJson = (index: number): Record<string, unknown> => {
    const body = transport.mock.calls[index]?.[0].body;
    if (typeof body !== 'string') throw new Error('expected a JSON body');
    return JSON.parse(body) as Record<string, unknown>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requests', () => {
    it('sends no credential when publishing', async () => {
      reply(201, shareResponse);
      await client.createShare({ title: 'Note', markdown: '# Note' });

      const headers = transport.mock.calls[0]?.[0].headers ?? {};
      expect(headers.Authorization).toBeUndefined();
      expect(headers[EDIT_TOKEN_HEADER]).toBeUndefined();
    });

    it('sends the edit token when changing an existing share', async () => {
      reply(200, updateResponse);
      await client.updateShare(SHARE_ID, TOKEN, { title: 'Note', markdown: '# Changed' });

      expect(transport.mock.calls[0]?.[0].headers[EDIT_TOKEN_HEADER]).toBe(TOKEN);
    });

    it('sends the edit token when attaching an image', async () => {
      reply(201, assetResponse);
      await client.uploadAsset({
        shareId: SHARE_ID,
        editToken: TOKEN,
        filename: 'a.png',
        contentType: 'image/png',
        bytes: new Uint8Array([1, 2, 3, 4]).buffer,
      });

      expect(transport.mock.calls[0]?.[0].headers[EDIT_TOKEN_HEADER]).toBe(TOKEN);
    });

    it('sends the edit token when unsharing', async () => {
      transport.mockResolvedValue({ status: 204, text: '' });
      await client.deleteShare(SHARE_ID, TOKEN);

      expect(transport.mock.calls[0]?.[0].headers[EDIT_TOKEN_HEADER]).toBe(TOKEN);
    });

    it('builds urls from the contract routes, not by hand', async () => {
      reply(201, shareResponse);
      await client.createShare({ title: 'Note', markdown: '# Note' });

      expect(transport.mock.calls[0]?.[0].url).toBe(`https://notes.example.com${ROUTES.shares}`);
    });

    it('does not double a slash when the server url has a trailing one', async () => {
      const trailing = new ShareApiClient(transport, {
        serverUrl: 'https://notes.example.com/',
      });
      reply(201, shareResponse);
      await trailing.createShare({ title: 'Note', markdown: '# Note' });

      expect(transport.mock.calls[0]?.[0].url).toBe('https://notes.example.com/v1/shares');
    });

    it('sends the note as json', async () => {
      reply(201, shareResponse);
      await client.createShare({ title: 'Note', markdown: '# Note' });

      const request = transport.mock.calls[0]?.[0];
      expect(request?.method).toBe('POST');
      expect(request?.headers['Content-Type']).toBe('application/json');
      expect(sentJson(0)).toEqual({ title: 'Note', markdown: '# Note' });
    });

    it('updates at the share route', async () => {
      reply(200, updateResponse);
      await client.updateShare(SHARE_ID, TOKEN, { title: 'Note', markdown: '# Changed' });

      expect(transport.mock.calls[0]?.[0].method).toBe('PUT');
      expect(transport.mock.calls[0]?.[0].url).toBe(
        `https://notes.example.com${ROUTES.share(SHARE_ID)}`,
      );
    });

    it('uploads an attachment as multipart', async () => {
      reply(201, assetResponse);
      await client.uploadAsset({
        shareId: SHARE_ID,
        editToken: TOKEN,
        filename: 'a.png',
        contentType: 'image/png',
        bytes: new Uint8Array([1, 2, 3, 4]).buffer,
      });

      const request = transport.mock.calls[0]?.[0];
      expect(request?.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
      expect(request?.body).toBeInstanceOf(ArrayBuffer);
    });

    it('accepts 204 for a delete', async () => {
      transport.mockResolvedValue({ status: 204, text: '' });
      await expect(client.deleteShare(SHARE_ID, TOKEN)).resolves.toBeUndefined();
    });
  });

  describe('responses', () => {
    it('reports the server as ready when it is', async () => {
      reply(200, readyResponse);
      await expect(client.ready()).resolves.toEqual(readyResponse);
    });

    it('returns the parsed share, including its one-time token', async () => {
      reply(201, shareResponse);
      await expect(client.createShare({ title: 'Note', markdown: 'x' })).resolves.toEqual(
        shareResponse,
      );
    });

    it('reports the contract error code the server sent', async () => {
      reply(404, { error: { code: 'NOT_FOUND', message: 'No such share' } });

      await expect(
        client.updateShare(SHARE_ID, TOKEN, { title: 'x', markdown: 'y' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it.each([
      [401, 'UNAUTHORIZED'],
      [413, 'PAYLOAD_TOO_LARGE'],
      [415, 'UNSUPPORTED_MEDIA_TYPE'],
      [429, 'TOO_MANY_REQUESTS'],
    ])('maps a %s response to %s', async (status, code) => {
      reply(status, { error: { code, message: 'nope' } });

      await expect(client.createShare({ title: 'x', markdown: 'y' })).rejects.toMatchObject({
        code,
      });
    });

    it('reports BAD_RESPONSE when the url is not a share-note server', async () => {
      transport.mockResolvedValue({ status: 200, text: '<!doctype html><title>Hello</title>' });

      await expect(client.ready()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    });

    it('reports BAD_RESPONSE for an error body in an unknown shape', async () => {
      transport.mockResolvedValue({ status: 500, text: 'Internal Server Error' });

      await expect(client.createShare({ title: 'x', markdown: 'y' })).rejects.toMatchObject({
        code: 'BAD_RESPONSE',
      });
    });

    it('rejects a create response with no edit token, which would strand the note', async () => {
      const { editToken: _omitted, ...withoutToken } = shareResponse;
      reply(201, withoutToken);

      await expect(client.createShare({ title: 'x', markdown: 'y' })).rejects.toMatchObject({
        code: 'BAD_RESPONSE',
      });
    });

    it('rejects a success payload that does not match the contract', async () => {
      reply(201, { id: 'too-short', url: 'not-a-url' });

      await expect(client.createShare({ title: 'x', markdown: 'y' })).rejects.toBeInstanceOf(
        ShareApiError,
      );
    });

    it('rejects a delete that answers 200 instead of 204', async () => {
      transport.mockResolvedValue({ status: 200, text: '' });
      await expect(client.deleteShare(SHARE_ID, TOKEN)).rejects.toBeInstanceOf(ShareApiError);
    });

    it('lets a transport failure through as-is', async () => {
      transport.mockRejectedValue(new ShareApiError('NETWORK_ERROR', 'offline'));
      await expect(client.ready()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });
  });
});
