import { describe, expect, it } from 'vitest';
import { sniffImageMimeType } from './mime';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const gif87 = Buffer.from('GIF87a\u0001\u0000', 'latin1');
const gif89 = Buffer.from('GIF89a\u0001\u0000', 'latin1');
const webp = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);

describe('sniffImageMimeType', () => {
  it.each([
    ['png', png, 'image/png'],
    ['jpeg', jpeg, 'image/jpeg'],
    ['gif87a', gif87, 'image/gif'],
    ['gif89a', gif89, 'image/gif'],
    ['webp', webp, 'image/webp'],
  ])('identifies %s', (_label, bytes, expected) => {
    expect(sniffImageMimeType(bytes)).toBe(expected);
  });

  it('rejects svg however it is dressed up', () => {
    expect(
      sniffImageMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" />')),
    ).toBeNull();
    expect(
      sniffImageMimeType(Buffer.from('<?xml version="1.0"?><svg onload="alert(1)"/>')),
    ).toBeNull();
  });

  it('rejects html, scripts and archives', () => {
    expect(sniffImageMimeType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageMimeType(Buffer.from('#!/bin/sh\nrm -rf /'))).toBeNull();
    expect(sniffImageMimeType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });

  it('rejects a RIFF container that is not WebP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVEfmt ', 'latin1'),
    ]);
    expect(sniffImageMimeType(wav)).toBeNull();
  });

  it('rejects a truncated signature rather than reading past the end', () => {
    expect(sniffImageMimeType(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffImageMimeType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageMimeType(Buffer.from('RIFF', 'latin1'))).toBeNull();
  });

  it('is not fooled by a png signature that appears later in the file', () => {
    const payload = Buffer.concat([Buffer.from('GIF'), png]);
    expect(sniffImageMimeType(payload)).toBeNull();
  });
});
