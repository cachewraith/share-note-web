import { z } from 'zod';

/**
 * Public identifiers use the URL-safe alphabet and are generated from a CSPRNG.
 * 21 characters over a 64-symbol alphabet is ~126 bits of entropy, which is what
 * makes a share link unguessable (there is no other access control on it).
 */
export const PUBLIC_ID_LENGTH = 21;
export const PUBLIC_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const PUBLIC_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${String(PUBLIC_ID_LENGTH)}}$`);

export const PublicIdSchema = z.string().regex(PUBLIC_ID_PATTERN, 'Invalid public id');

export const ShareIdSchema = PublicIdSchema;
export const AssetIdSchema = PublicIdSchema;

export type ShareId = z.infer<typeof ShareIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;

/** sha256, lowercase hex. */
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Invalid sha-256 digest');

/**
 * API key wire format: `snw_<prefix>_<secret>`. The prefix is stored in clear and
 * indexed so a key can be looked up without scanning; only a hash of the whole
 * key is persisted.
 */
export const API_KEY_PREFIX_LENGTH = 8;
export const API_KEY_SECRET_LENGTH = 43;
export const ApiKeySchema = z
  .string()
  .regex(
    new RegExp(
      `^snw_[A-Za-z0-9_-]{${String(API_KEY_PREFIX_LENGTH)}}_[A-Za-z0-9_-]{${String(API_KEY_SECRET_LENGTH)}}$`,
    ),
    'Invalid API key format',
  );
