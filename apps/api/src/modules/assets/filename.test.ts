import { describe, expect, it } from 'vitest';
import { contentDisposition, validateFilename } from './filename';

describe('validateFilename', () => {
  it('keeps spaces, unicode and case', () => {
    expect(validateFilename('Diagramme Été.png')).toBe('Diagramme Été.png');
  });

  it('trims surrounding whitespace', () => {
    expect(validateFilename('  a.png  ')).toBe('a.png');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['path separator', 'images/a.png'],
    ['windows separator', 'images\\a.png'],
    ['traversal', '..'],
    ['single dot', '.'],
    ['newline', 'a\npng'],
    ['carriage return header injection', 'a.png\r\nX-Evil: 1'],
    ['nul byte', 'a\u0000.png'],
    ['too long', `${'a'.repeat(256)}.png`],
  ])('rejects %s', (_label, value) => {
    expect(validateFilename(value)).toBeNull();
  });
});

describe('contentDisposition', () => {
  it('emits both an ascii fallback and the utf-8 name', () => {
    expect(contentDisposition('Été.png')).toBe(
      'inline; filename="_t_.png"; filename*=UTF-8\'\'%C3%89t%C3%A9.png',
    );
  });

  it('cannot be escaped with a quote', () => {
    const header = contentDisposition('a";X-Evil: 1.png');
    expect(header.match(/"/g)).toHaveLength(2);
    expect(header).not.toContain('X-Evil: 1.png"');
  });

  it('falls back to a placeholder when nothing ascii survives', () => {
    expect(contentDisposition('日本語')).toContain('filename="___"');
  });
});
