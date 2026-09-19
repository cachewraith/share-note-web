/**
 * Default protocol limits.
 *
 * These are the values the published contract validates against, so clients can
 * fail fast without a round trip. A server may configure *stricter* limits; it
 * enforces them itself and answers with `PAYLOAD_TOO_LARGE` / `ASSET_LIMIT_REACHED`.
 * A server must never configure looser limits than these.
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
