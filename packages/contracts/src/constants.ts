/**
 * The parts of the contract that are plain values: limits, identifier shapes,
 * error codes and routes.
 *
 * Deliberately free of any import. `@share-note/contracts/lite` re-exports this
 * module plus the hand-written guards, so the Obsidian plugin can speak the
 * contract without bundling zod — see docs/decisions/0013.
 */

/* --------------------------------------------------------------- limits --- */

/**
 * Default protocol limits.
 *
 * These are the values the published contract validates against, so clients can
 * fail fast without a round trip. A server may configure *stricter* limits; it
 * enforces them itself and answers with `PAYLOAD_TOO_LARGE` /
 * `ASSET_LIMIT_REACHED`. A server must never configure looser limits than these.
 */
export const LIMITS = {
  /** Maximum size of a note's markdown, in UTF-8 bytes. */
  markdownMaxBytes: 1_048_576,
  /** Maximum size of a single attachment, in bytes. */
  assetMaxBytes: 10_485_760,
  /** Maximum number of attachments per share. */
  assetsPerShareMax: 50,
  /** Maximum length of a share title, in characters. */
  titleMaxLength: 300,
  /** Maximum length of an attachment filename, in characters. */
  filenameMaxLength: 255,
} as const;

/** Image types accepted as attachments. SVG is excluded: it can carry script. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const EXTENSION_BY_MIME: Record<AllowedImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function isAllowedImageMimeType(value: string): value is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function extensionForMimeType(mime: AllowedImageMimeType): string {
  return EXTENSION_BY_MIME[mime];
}

/** Length of a string in UTF-8 bytes. Works in Node, browsers and Obsidian. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/* ----------------------------------------------------------------- ids --- */

/**
 * Public identifiers use the URL-safe alphabet and are generated from a CSPRNG.
 * 21 characters over a 64-symbol alphabet is ~126 bits of entropy, which is what
 * makes a share link unguessable (there is no other access control on it).
 */
export const PUBLIC_ID_LENGTH = 21;
export const PUBLIC_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export const PUBLIC_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${String(PUBLIC_ID_LENGTH)}}$`);

/** sha-256, lowercase hex. */
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * API key wire format: `snw_<prefix>_<secret>`. The prefix is stored in clear
 * and indexed so a key can be looked up without scanning; only a hash of the
 * whole key is persisted.
 */
export const API_KEY_PREFIX_LENGTH = 8;
export const API_KEY_SECRET_LENGTH = 43;
export const API_KEY_PATTERN = new RegExp(
  `^snw_[A-Za-z0-9_-]{${String(API_KEY_PREFIX_LENGTH)}}_[A-Za-z0-9_-]{${String(
    API_KEY_SECRET_LENGTH,
  )}}$`,
);

/* -------------------------------------------------------------- errors --- */

/**
 * Stable, machine-readable error codes. Clients branch on these; the `message`
 * is for humans and may change. Never add a code without documenting it in
 * docs/api.md.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'ASSET_LIMIT_REACHED',
  'TOO_MANY_REQUESTS',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  ASSET_LIMIT_REACHED: 422,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/* -------------------------------------------------------------- routes --- */

/**
 * Every path the API serves, in one place. The API mounts these, the web app
 * and the plugin call them; nobody hand-writes a URL.
 */
export const API_VERSION = 'v1';

export const ROUTES = {
  health: '/health',
  ready: '/ready',
  docs: '/docs',

  me: `/${API_VERSION}/me`,

  shares: `/${API_VERSION}/shares`,
  share: (id: string) => `/${API_VERSION}/shares/${id}`,
  shareAssets: (id: string) => `/${API_VERSION}/shares/${id}/assets`,

  publicShare: (id: string) => `/${API_VERSION}/public/shares/${id}`,
  publicAsset: (id: string) => `/${API_VERSION}/public/assets/${id}`,
} as const;

/** Controller-level path segments, for the API's own routing decorators. */
export const CONTROLLER_PATHS = {
  shares: `${API_VERSION}/shares`,
  me: `${API_VERSION}/me`,
  public: `${API_VERSION}/public`,
} as const;

export const AUTH_HEADER = 'authorization';
export const AUTH_SCHEME = 'Bearer';

/** The multipart field the attachment bytes arrive in. */
export const ASSET_FILE_FIELD = 'file';

export const LIST_SHARES_DEFAULT_LIMIT = 50;
export const LIST_SHARES_MAX_LIMIT = 200;

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
