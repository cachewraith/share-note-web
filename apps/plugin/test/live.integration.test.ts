import { isPublicShareResponse, ROUTES } from '@share-note/contracts/lite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ShareApiClient } from '../src/core/api-client';
import type { AttachmentReference } from '../src/core/attachments';
import type { HttpRequest, HttpResponse } from '../src/core/http';
import type { AttachmentHandle, NoteGateway, NoteHandle } from '../src/core/note-gateway';
import { ShareService } from '../src/core/share-service';
import { DEFAULT_SETTINGS, type ShareNoteSettings } from '../src/core/settings';

/**
 * Drives the plugin's real client and service against a running server.
 *
 * Obsidian itself cannot be booted here, so the vault is a fake and the
 * transport is `fetch` — the same two seams the plugin already has. Everything
 * between them is the code that ships.
 *
 * Needs TEST_API_URL; skipped when it is absent so the ordinary unit run stays
 * offline. There is no key to supply — the server has no accounts.
 */
const serverUrl = process.env.TEST_API_URL;
const live = serverUrl !== undefined;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(48, 0x33),
]);
const OTHER_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(48, 0x77),
]);

const NOTE: NoteHandle = { path: 'Design.md', title: 'Live plugin test' };

const fetchTransport = async (request: HttpRequest): Promise<HttpResponse> => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined ? {} : { body: request.body }),
  });
  return { status: response.status, text: await response.text() };
};

class FakeVault implements NoteGateway {
  markdown = '# Live plugin test\n';
  shareId: string | null = null;
  shareUrl: string | null = null;
  shareToken: string | null = null;
  attachments = new Map<string, Buffer>();

  readMarkdown(): Promise<string> {
    return Promise.resolve(this.markdown);
  }
  shareIdOf(): string | null {
    return this.shareId;
  }
  shareUrlOf(): string | null {
    return this.shareUrl;
  }
  shareTokenOf(): string | null {
    return this.shareToken;
  }
  writeShareDetails(
    _note: NoteHandle,
    share: { id: string; url: string; editToken?: string },
  ): Promise<void> {
    this.shareId = share.id;
    this.shareUrl = share.url;
    if (share.editToken !== undefined) this.shareToken = share.editToken;
    return Promise.resolve();
  }
  clearShareDetails(): Promise<void> {
    this.shareId = null;
    this.shareUrl = null;
    this.shareToken = null;
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
          read: () =>
            Promise.resolve(
              bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
              ) as ArrayBuffer,
            ),
        },
      ];
    });
  }
}

describe.skipIf(!live)('plugin against a live server', () => {
  let vault: FakeVault;
  let settings: ShareNoteSettings;
  let service: ShareService;
  let client: ShareApiClient;
  /** Shares this run published, with the token needed to clean each one up. */
  const created: { id: string; editToken: string }[] = [];

  async function publicShare(id: string) {
    const response = await fetch(`${serverUrl!}${ROUTES.publicShare(id)}`);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (!isPublicShareResponse(body)) throw new Error('not a share payload');
    return body;
  }

  beforeAll(() => {
    client = new ShareApiClient(fetchTransport, { serverUrl: serverUrl! });
  });

  beforeEach(() => {
    vault = new FakeVault();
    settings = { ...DEFAULT_SETTINGS, uploads: {} };
    service = new ShareService(client, vault, settings, () => Promise.resolve());
  });

  afterAll(async () => {
    for (const share of created) {
      await client.deleteShare(share.id, share.editToken).catch(() => undefined);
    }
  });

  it('reports the server ready without presenting a credential', async () => {
    const ready = await client.ready();
    expect(ready.status).toBe('ready');
    expect(ready.checks).toMatchObject({ database: 'up', redis: 'up', storage: 'up' });
  });

  it('shares a note and serves it publicly', async () => {
    vault.markdown = '# Live plugin test\n\nBody text.\n';

    const result = await service.share(NOTE);
    created.push({ id: result.id, editToken: vault.shareToken! });

    expect(result.kind).toBe('created');
    const published = await publicShare(result.id);
    expect(published.title).toBe('Live plugin test');
    expect(published.markdown).toBe('# Live plugin test\n\nBody text.\n');
  });

  it('never uploads frontmatter', async () => {
    vault.markdown = '---\nsecret: hunter2\n---\n\n# Live plugin test\n';

    const result = await service.share(NOTE);
    created.push({ id: result.id, editToken: vault.shareToken! });

    const published = await publicShare(result.id);
    expect(published.markdown).not.toContain('hunter2');
  });

  it('updates at the same url and skips work when nothing changed', async () => {
    const first = await service.share(NOTE);
    created.push({ id: first.id, editToken: vault.shareToken! });

    const unchanged = await service.share(NOTE);
    expect(unchanged.kind).toBe('unchanged');
    expect(unchanged.url).toBe(first.url);

    vault.markdown = '# Live plugin test\n\nEdited.\n';
    const updated = await service.share(NOTE);
    expect(updated.kind).toBe('updated');
    expect(updated.url).toBe(first.url);
    expect((await publicShare(first.id)).markdown).toContain('Edited.');
  });

  it('uploads an attachment, then skips it while the bytes are the same', async () => {
    vault.markdown = '# Live plugin test\n\n![[diagram.png]]\n';
    vault.attachments.set('diagram.png', PNG);

    const first = await service.share(NOTE);
    created.push({ id: first.id, editToken: vault.shareToken! });
    expect(first.uploaded).toBe(1);

    const published = await publicShare(first.id);
    expect(published.assets).toHaveLength(1);
    expect(published.assets[0]?.filename).toBe('diagram.png');

    const asset = await fetch(published.assets[0]!.url);
    expect(asset.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await asset.arrayBuffer()).equals(PNG)).toBe(true);

    const second = await service.share(NOTE);
    expect(second.uploaded).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it('re-uploads an edited attachment and the viewer sees the new bytes', async () => {
    vault.markdown = '# Live plugin test\n\n![[diagram.png]]\n';
    vault.attachments.set('diagram.png', PNG);

    const first = await service.share(NOTE);
    created.push({ id: first.id, editToken: vault.shareToken! });

    vault.attachments.set('diagram.png', OTHER_PNG);
    const second = await service.share(NOTE);
    expect(second.uploaded).toBe(1);

    const published = await publicShare(first.id);
    const asset = await fetch(published.assets[0]!.url);
    expect(Buffer.from(await asset.arrayBuffer()).equals(OTHER_PNG)).toBe(true);
  });

  it('unshares, after which the link and the attachment are gone', async () => {
    vault.markdown = '# Live plugin test\n\n![[diagram.png]]\n';
    vault.attachments.set('diagram.png', PNG);

    const shared = await service.share(NOTE);
    const published = await publicShare(shared.id);
    const assetUrl = published.assets[0]!.url;

    const result = await service.unshare(NOTE);

    expect(result.deletedOnServer).toBe(true);
    expect(vault.shareId).toBeNull();
    expect((await fetch(`${serverUrl!}${ROUTES.publicShare(shared.id)}`)).status).toBe(404);
    expect((await fetch(assetUrl)).status).toBe(404);
  });

  it('publishes afresh when the recorded share was deleted elsewhere', async () => {
    const first = await service.share(NOTE);
    await client.deleteShare(first.id, vault.shareToken!);

    const second = await service.share(NOTE);
    created.push({ id: second.id, editToken: vault.shareToken! });

    expect(second.kind).toBe('created');
    expect(second.id).not.toBe(first.id);
  });

  it('refuses to change a share when the token is wrong, and says so as NOT_FOUND', async () => {
    const shared = await service.share(NOTE);
    created.push({ id: shared.id, editToken: vault.shareToken! });

    await expect(
      client.updateShare(shared.id, `snt_${'z'.repeat(43)}`, {
        title: 'hijacked',
        markdown: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const published = await publicShare(shared.id);
    expect(published.title).not.toBe('hijacked');
  });

  it('reports a url that is not a share-note server', async () => {
    const elsewhere = new ShareApiClient(fetchTransport, {
      serverUrl: `${serverUrl!}/not-an-api`,
    });

    await expect(elsewhere.ready()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
