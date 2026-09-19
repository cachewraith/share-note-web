import { LIMITS } from '@share-note/contracts';

/**
 * The filename is the key the viewer resolves `![[diagram.png]]` against, so it
 * is stored exactly as the note spells it — spaces, accents and all. It is
 * never used to build a storage key or a filesystem path, so the only rules are
 * the ones that keep it from being dangerous or absurd.
 */
export function validateFilename(raw: string): string | null {
  const filename = raw.normalize('NFC').trim();

  if (filename.length === 0) return null;
  if (filename.length > LIMITS.filenameMaxLength) return null;
  // Control characters would end up in a response header; separators and `..`
  // are meaningless here and only ever appear in a traversal attempt.
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(filename)) return null;
  if (filename.includes('/') || filename.includes('\\')) return null;
  if (filename === '.' || filename === '..') return null;

  return filename;
}

/**
 * `Content-Disposition` per RFC 6266: a conservative ASCII fallback for old
 * clients plus the real name as RFC 5987. Both halves are escaped, so a
 * filename can never break out of the header.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'file';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
