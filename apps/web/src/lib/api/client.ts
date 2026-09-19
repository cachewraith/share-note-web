import { PublicShareResponseSchema, ROUTES, type PublicShareResponse } from '@share-note/contracts';
import { getConfig } from '../config';

/**
 * Reads a shared note from the API.
 *
 * The response is parsed with the contract schema rather than cast: the viewer
 * renders whatever comes back, so a malformed payload should fail here where it
 * can be logged, not halfway through the markdown pipeline.
 *
 * Returns null for "no such share" so the caller can render a 404; anything
 * else throws and becomes an error page.
 */
export async function fetchShare(id: string): Promise<PublicShareResponse | null> {
  const config = getConfig();

  const response = await fetch(`${config.apiInternalUrl}${ROUTES.publicShare(id)}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: config.shareRevalidateSeconds, tags: [`share:${id}`] },
  });

  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) {
    throw new Error(`Share lookup failed with status ${String(response.status)}`);
  }

  const parsed = PublicShareResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Share response did not match the API contract');
  }
  return parsed.data;
}
