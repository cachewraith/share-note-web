import { randomBytes } from 'node:crypto';
import {
  API_KEY_PREFIX_LENGTH,
  ApiKeySchema,
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
} from '@share-note/contracts';
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

export interface GeneratedApiKey {
  /** The full key. Shown to the operator once and never stored. */
  readonly key: string;
  readonly prefix: string;
  readonly keyHash: string;
}

/**
 * `snw_<prefix>_<secret>`. The prefix is a clear-text lookup handle; the secret
 * is 32 CSPRNG bytes. Only `sha256(key)` reaches the database.
 */
export function generateApiKey(): GeneratedApiKey {
  const prefix = generatePublicId(API_KEY_PREFIX_LENGTH);
  const secret = randomBytes(32).toString('base64url');
  const key = `snw_${prefix}_${secret}`;
  return { key, prefix, keyHash: sha256Hex(key) };
}

export interface ParsedApiKey {
  readonly prefix: string;
  readonly keyHash: string;
}

/**
 * Splits a presented key into its lookup handle and digest. Returns null for
 * anything that is not exactly the shape the contract defines, so malformed
 * input never reaches the database.
 *
 * The segments cannot be found by splitting on `_`: the base64url secret
 * contains `_` and `-`. The contract's pattern fixes every segment's width, so
 * the offsets are constant.
 */
const PREFIX_OFFSET = 'snw_'.length;

export function parseApiKey(presented: string): ParsedApiKey | null {
  if (!ApiKeySchema.safeParse(presented).success) return null;
  return {
    prefix: presented.slice(PREFIX_OFFSET, PREFIX_OFFSET + API_KEY_PREFIX_LENGTH),
    keyHash: sha256Hex(presented),
  };
}
