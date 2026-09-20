import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareApiClient } from './api-client';
import type { AttachmentReference } from './attachments';
import { ShareApiError } from './errors';
import type { HttpRequest, HttpResponse } from './http';
import type { AttachmentHandle, NoteGateway, NoteHandle } from './note-gateway';
import { DEFAULT_SETTINGS, type ShareNoteSettings } from './settings';
import { ShareService } from './share-service';

const SHARE_ID = 'aaaaaaaaaaaaaaaaaaaaa';
const SHARE_URL = `https://notes.example.com/${SHARE_ID}`;
const NOTE: NoteHandle = { path: 'Notes/Design.md', title: 'Design' };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer;
const OTHER_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]).buffer;

/** An in-memory vault. No Obsidian, no filesystem. */
class FakeGateway implements NoteGateway {
  markdown = '# Design\n';
  shareId: string | null = null;
  shareUrl: string | null = null;
  attachments = new Map<string, ArrayBuffer>();
  readCounts = new Map<string, number>();
  written: { id: string; url: string } | null = null;
  cleared = false;

  readMarkdown(): Promise<string> {
    return Promise.resolve(this.markdown);
  }
  shareIdOf(): string | null {
    return this.shareId;
  }
  shareUrlOf(): string | null {
    return this.shareUrl;
  }
  writeShareDetails(_note: NoteHandle, share: { id: string; url: string }): Promise<void> {
    this.written = share;
    this.shareId = share.id;
    this.shareUrl = share.url;
    return Promise.resolve();
  }
  clearShareDetails(): Promise<void> {
    this.cleared = true;
    this.shareId = null;
    this.shareUrl = null;
    return Promise.resolve();
  }
  resolveAttachments(references: readonly AttachmentReference[]): AttachmentHandle[] {
    return references.flatMap((reference) => {
      const bytes = this.attachments.get(reference.filename);
      if (!bytes) return [];
      return [
        {
          reference,
          contentType: 'image/png',
          read: () => {
            this.readCounts.set(
              reference.filename,
              (this.readCounts.get(reference.filename) ?? 0) + 1,
            );
            return Promise.resolve(bytes);
          },
        },
      ];
    });
  }
}

describe('ShareService', () => {
  const transport = vi.fn<(request: HttpRequest) => Promise<HttpResponse>>();
  let gateway: FakeGateway;
  let settings: ShareNoteSettings;
  let persist: ReturnType<typeof vi.fn>;
  let service: ShareService;

  const reply = (status: number, body: unknown) =>
    transport.mockResolvedValueOnce({ status, text: JSON.stringify(body) });

  /** The JSON body of the nth request, as an object. */
  const sentJson = (index: number): Record<string, unknown> => {
    const body = transport.mock.calls[index]?.[0].body;
    if (typeof body !== 'string') throw new Error('expected a JSON body');
    return JSON.parse(body) as Record<string, unknown>;
  };

  const createReply = () =>
    reply(201, { id: SHARE_ID, url: SHARE_URL, contentHash: 'f'.repeat(64) });
  const updateReply = (updated: boolean) =>
    reply(200, { id: SHARE_ID, url: SHARE_URL, contentHash: 'f'.repeat(64), updated });
  const assetReply = (created = true) =>
    reply(201, {
      id: 'bbbbbbbbbbbbbbbbbbbbb',
      url: 'https://api.example.com/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb',
      filename: 'a.png',
      mime: 'image/png',
      size: 7,
      sha256: 'e'.repeat(64),
      created,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new FakeGateway();
    settings = { ...DEFAULT_SETTINGS, uploads: {} };
    persist = vi.fn().mockResolvedValue(undefined);
    service = new ShareService(
      new ShareApiClient(transport, {
        serverUrl: 'https://notes.example.com',
        apiKey: `snw_abcd1234_${'a'.repeat(43)}`,
      }),
      gateway,
      settings,
      persist as () => Promise<void>,
    );
  });

  describe('first share', () => {
    it('creates the share and records it on the note', async () => {
      createReply();

      const result = await service.share(NOTE);

      expect(result).toMatchObject({ kind: 'created', id: SHARE_ID, url: SHARE_URL });
      expect(gateway.written).toEqual({ id: SHARE_ID, url: SHARE_URL });
    });

    it('uploads the note without its frontmatter', async () => {
      gateway.markdown = '---\nsecret: hunter2\n---\n\n# Design\n';
      createReply();

      await service.share(NOTE);

      const body = sentJson(0);
      expect(JSON.stringify(body)).not.toContain('hunter2');
      expect(body).toEqual({ title: 'Design', markdown: '# Design\n' });
    });

    it('uses the note name as the title', async () => {
      createReply();
      await service.share(NOTE);
      expect(sentJson(0).title).toBe('Design');
    });
  });

  describe('re-sharing', () => {
    beforeEach(() => {
      gateway.shareId = SHARE_ID;
    });

    it('updates the existing share rather than creating another', async () => {
      updateReply(true);

      const result = await service.share(NOTE);

      expect(result.kind).toBe('updated');
      expect(result.url).toBe(SHARE_URL);
      expect(transport.mock.calls[0]?.[0].method).toBe('PUT');
    });

    it('reports nothing to do when the server says the content is unchanged', async () => {
      updateReply(false);
      expect((await service.share(NOTE)).kind).toBe('unchanged');
    });

    it('publishes afresh when the recorded share no longer exists', async () => {
      reply(404, { error: { code: 'NOT_FOUND', message: 'No such share' } });
      createReply();

      const result = await service.share(NOTE);

      expect(result.kind).toBe('created');
      expect(transport.mock.calls[1]?.[0].method).toBe('POST');
    });

    it('does not swallow an error other than NOT_FOUND', async () => {
      reply(401, { error: { code: 'UNAUTHORIZED', message: 'nope' } });
      await expect(service.share(NOTE)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('attachments', () => {
    beforeEach(() => {
      gateway.markdown = '# Design\n\n![[a.png]]\n';
      gateway.attachments.set('a.png', PNG);
    });

    it('uploads an embedded image', async () => {
      createReply();
      assetReply();

      const result = await service.share(NOTE);

      expect(result.uploaded).toBe(1);
      expect(transport.mock.calls[1]?.[0].url).toContain(`/v1/shares/${SHARE_ID}/assets`);
    });

    it('remembers what it uploaded', async () => {
      createReply();
      assetReply();

      await service.share(NOTE);

      expect(Object.keys(settings.uploads[SHARE_ID] ?? {})).toEqual(['a.png']);
      expect(persist).toHaveBeenCalled();
    });

    it('skips an attachment whose bytes have not changed', async () => {
      createReply();
      assetReply();
      await service.share(NOTE);

      updateReply(false);
      const second = await service.share(NOTE);

      expect(second.uploaded).toBe(0);
      expect(second.skipped).toBe(1);
      expect(transport).toHaveBeenCalledTimes(3);
    });

    it('re-uploads when the image changes', async () => {
      createReply();
      assetReply();
      await service.share(NOTE);

      gateway.attachments.set('a.png', OTHER_PNG);
      updateReply(false);
      assetReply();
      const second = await service.share(NOTE);

      expect(second.uploaded).toBe(1);
    });

    it('reports an update when only an attachment changed', async () => {
      createReply();
      assetReply();
      await service.share(NOTE);

      gateway.attachments.set('a.png', OTHER_PNG);
      updateReply(false);
      assetReply();

      expect((await service.share(NOTE)).kind).toBe('updated');
    });

    it('forgets an attachment the note no longer embeds', async () => {
      createReply();
      assetReply();
      await service.share(NOTE);

      gateway.markdown = '# Design\n';
      updateReply(true);
      await service.share(NOTE);

      expect(settings.uploads[SHARE_ID]).toEqual({});
    });

    it('ignores a reference that resolves to nothing', async () => {
      gateway.markdown = '# Design\n\n![[missing.png]]\n';
      createReply();

      const result = await service.share(NOTE);

      expect(result.uploaded).toBe(0);
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('does not upload images that only appear inside code', async () => {
      gateway.markdown = '# Design\n\n```md\n![[a.png]]\n```\n';
      createReply();

      expect((await service.share(NOTE)).uploaded).toBe(0);
    });
  });

  describe('unshare', () => {
    beforeEach(() => {
      gateway.shareId = SHARE_ID;
      settings.uploads[SHARE_ID] = { 'a.png': 'f'.repeat(64) };
    });

    it('deletes the share and clears the note', async () => {
      transport.mockResolvedValueOnce({ status: 204, text: '' });

      const result = await service.unshare(NOTE);

      expect(result.deletedOnServer).toBe(true);
      expect(gateway.cleared).toBe(true);
      expect(settings.uploads[SHARE_ID]).toBeUndefined();
    });

    it('still tidies the note when the share was already gone', async () => {
      reply(404, { error: { code: 'NOT_FOUND', message: 'No such share' } });

      const result = await service.unshare(NOTE);

      expect(result.deletedOnServer).toBe(false);
      expect(gateway.cleared).toBe(true);
    });

    it('leaves the note alone when the server refuses for another reason', async () => {
      reply(401, { error: { code: 'UNAUTHORIZED', message: 'nope' } });

      await expect(service.unshare(NOTE)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(gateway.cleared).toBe(false);
    });

    it('refuses to unshare a note that was never shared', async () => {
      gateway.shareId = null;

      await expect(service.unshare(NOTE)).rejects.toBeInstanceOf(ShareApiError);
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe('progress', () => {
    it('reports each step', async () => {
      gateway.markdown = '# Design\n\n![[a.png]]\n';
      gateway.attachments.set('a.png', PNG);
      createReply();
      assetReply();

      const messages: string[] = [];
      await service.share(NOTE, (message) => messages.push(message));

      expect(messages).toEqual(['Sharing note…', 'Uploading attachment 1 of 1…']);
    });
  });
});
