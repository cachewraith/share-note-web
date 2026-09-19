import type { PublicShareResponse } from '@share-note/contracts';
import { describe, expect, it } from 'vitest';
import { renderShare } from './render-cache';

const share = (overrides: Partial<PublicShareResponse> = {}): PublicShareResponse => ({
  id: 'aaaaaaaaaaaaaaaaaaaaa',
  title: 'Note',
  markdown: '# Note',
  contentHash: 'a'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  assets: [],
  ...overrides,
});

describe('renderShare', () => {
  it('renders the markdown', async () => {
    await expect(renderShare(share())).resolves.toContain('<h1>Note</h1>');
  });

  it('serves the same html for the same content hash', async () => {
    const first = await renderShare(share());
    const second = await renderShare(share());
    expect(second).toBe(first);
  });

  it('re-renders when the content changes', async () => {
    const before = await renderShare(share());
    const after = await renderShare(share({ markdown: '# Changed', contentHash: 'b'.repeat(64) }));

    expect(after).not.toBe(before);
    expect(after).toContain('Changed');
  });

  it('re-renders when only the attachments change', async () => {
    const withoutAsset = await renderShare(
      share({ markdown: '![[a.png]]', contentHash: 'c'.repeat(64) }),
    );
    const withAsset = await renderShare(
      share({
        markdown: '![[a.png]]',
        contentHash: 'c'.repeat(64),
        assets: [
          {
            id: 'bbbbbbbbbbbbbbbbbbbbb',
            url: 'https://api.example.com/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb',
            filename: 'a.png',
            mime: 'image/png',
            size: 1,
            sha256: 'f'.repeat(64),
          },
        ],
      }),
    );

    expect(withoutAsset).not.toContain('<img');
    expect(withAsset).toContain('<img');
  });
});
