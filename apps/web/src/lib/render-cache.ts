import type { PublicShareResponse } from '@share-note/contracts';
import { renderMarkdown } from './markdown/render';

/**
 * Remembers rendered HTML by content hash.
 *
 * Highlighting is the expensive part of a request, and the API already gives us
 * a hash of the exact bytes it rendered from, so the key is exact: a note that
 * has been edited misses the cache by construction, and one that has not is
 * free. Bounded and insertion-ordered, so it cannot grow without limit — the
 * oldest entry goes when the cap is reached.
 *
 * Per process, so several instances each keep their own. That is fine: it is a
 * cache, not state.
 */
const MAX_ENTRIES = 256;
const cache = new Map<string, string>();

export async function renderShare(share: PublicShareResponse): Promise<string> {
  const key = `${share.contentHash}:${share.assets.map((asset) => asset.id).join(',')}`;

  const hit = cache.get(key);
  if (hit !== undefined) {
    // Refresh recency so a popular note is not evicted by a burst of new ones.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const html = await renderMarkdown({ markdown: share.markdown, assets: share.assets });

  cache.set(key, html);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return html;
}
