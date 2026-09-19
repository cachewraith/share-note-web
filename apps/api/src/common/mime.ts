import { type AllowedImageMimeType } from '@share-note/contracts';

/**
 * Identifies an image by its magic bytes.
 *
 * The extension and the client-supplied `Content-Type` are both attacker
 * controlled, so neither is trusted: this is the only thing that decides what
 * we store and what we later serve as `Content-Type` (OWASP A05/A08). SVG is
 * absent on purpose — it is a script-carrying document, not a raster image.
 */
export function sniffImageMimeType(bytes: Buffer): AllowedImageMimeType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (matchesAscii(bytes, 0, 'GIF87a') || matchesAscii(bytes, 0, 'GIF89a')) {
    return 'image/gif';
  }
  // RIFF container: "RIFF" <4-byte size> "WEBP"
  if (matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP')) {
    return 'image/webp';
  }
  return null;
}

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function matchesAscii(bytes: Buffer, offset: number, expected: string): boolean {
  if (bytes.length < offset + expected.length) return false;
  return bytes.toString('latin1', offset, offset + expected.length) === expected;
}
