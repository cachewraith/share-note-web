import { randomBytes } from 'node:crypto';
import { EDIT_TOKEN_PATTERN, PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH } from '@share-note/contracts';
import { sha256Hex } from './hash';

/**
 * nanoid's algorithm, inlined (see docs/decisions/0004): take random bytes,
 * mask them down to the alphabet size, and discard any value that still falls
 * outside it. Masking alone is uniform for the 64-symbol alphabet we use; the
 * rejection branch keeps it uniform if the alphabet ever changes length.
 */
export function generatePublicId(length: number = PUBLIC_ID_LENGTH): string {
  const alphabet = PUBLIC_ID_ALPHABET;
  const mask = (2 << (31 - Math.clz32(alphabet.length - 1))) - 1;
  // Slight over-fetch so the common case needs a single randomBytes() call.
  const step = Math.ceil((1.6 * mask * length) / alphabet.length);

  let id = '';
  while (id.length < length) {
    const bytes = randomBytes(step);
    for (let i = 0; i < step && id.length < length; i += 1) {
      const index = bytes[i]! & mask;
      if (index < alphabet.length) {
        id += alphabet[index];
      }
    }
  }
  return id;
}

export interface GeneratedEditToken {
  /** The full token. Returned to the author once and never stored. */
  readonly token: string;
  readonly tokenHash: string;
}

/**
 * `snt_<secret>`, where the secret is 32 CSPRNG bytes. Only `sha256(token)`
 * reaches the database, so a copy of the table does not let anyone edit the
 * shares in it.
 *
 * Unlike an API key there is no clear-text prefix to index: a token is always
 * presented alongside the share id it belongs to, so the row is found by id and
 * the token only ever has to be compared.
 */
export function generateEditToken(): GeneratedEditToken {
  const token = `snt_${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: sha256Hex(token) };
}

/**
 * Digest of a presented token, or null if it is not exactly the shape the
 * contract defines — so malformed input is refused before any comparison.
 */
export function hashPresentedEditToken(presented: string | undefined): string | null {
  if (presented === undefined || !EDIT_TOKEN_PATTERN.test(presented)) return null;
  return sha256Hex(presented);
}
