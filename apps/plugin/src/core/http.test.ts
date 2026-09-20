import { describe, expect, it } from 'vitest';
import { buildMultipartBody } from './http';

const decode = (buffer: ArrayBuffer) => new TextDecoder('latin1').decode(buffer);

describe('buildMultipartBody', () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;

  it('produces a body the boundary in the content type matches', () => {
    const result = buildMultipartBody({
      field: 'file',
      filename: 'a.png',
      contentType: 'image/png',
      bytes,
    });

    const boundary = /boundary=(.+)$/.exec(result.contentType)?.[1];
    expect(boundary).toBeDefined();
    expect(decode(result.body).startsWith(`--${boundary!}\r\n`)).toBe(true);
    expect(decode(result.body).endsWith(`\r\n--${boundary!}--\r\n`)).toBe(true);
  });

  it('includes the field name, filename and content type', () => {
    const body = decode(
      buildMultipartBody({
        field: 'file',
        filename: 'diagram.png',
        contentType: 'image/png',
        bytes,
        boundary: 'BOUND',
      }).body,
    );

    expect(body).toContain('Content-Disposition: form-data; name="file"; filename="diagram.png"');
    expect(body).toContain('Content-Type: image/png');
  });

  it('carries the file bytes through unchanged', () => {
    const result = buildMultipartBody({
      field: 'file',
      filename: 'a.png',
      contentType: 'image/png',
      bytes,
      boundary: 'BOUND',
    });

    const body = new Uint8Array(result.body);
    const marker = [0x89, 0x50, 0x4e, 0x47];
    const start = body.findIndex((_value, index) =>
      marker.every((byte, offset) => body[index + offset] === byte),
    );
    expect(start).toBeGreaterThan(0);
  });

  it('cannot be escaped through the filename', () => {
    const body = decode(
      buildMultipartBody({
        field: 'file',
        filename: 'a".png\r\nX-Evil: 1\r\n\r\n',
        contentType: 'image/png',
        bytes,
        boundary: 'BOUND',
      }).body,
    );

    // The characters survive as part of the value; what matters is that they
    // no longer start a line, so they are not a header.
    expect(body).not.toMatch(/\r\nX-Evil: 1/);
    expect(body.match(/Content-Disposition/g)).toHaveLength(1);
    expect(body.match(/--BOUND/g)).toHaveLength(2);
  });

  it('cannot be escaped through the content type', () => {
    const body = decode(
      buildMultipartBody({
        field: 'file',
        filename: 'a.png',
        contentType: 'image/png\r\nX-Evil: 1',
        bytes,
        boundary: 'BOUND',
      }).body,
    );

    expect(body).not.toMatch(/\r\nX-Evil: 1/);
    expect(body.match(/^Content-Type:/gm)).toHaveLength(1);
  });

  it('uses a different boundary each time', () => {
    const first = buildMultipartBody({
      field: 'file',
      filename: 'a.png',
      contentType: 'image/png',
      bytes,
    });
    const second = buildMultipartBody({
      field: 'file',
      filename: 'a.png',
      contentType: 'image/png',
      bytes,
    });

    expect(first.contentType).not.toBe(second.contentType);
  });

  it('handles an empty file', () => {
    const result = buildMultipartBody({
      field: 'file',
      filename: 'a.png',
      contentType: 'image/png',
      bytes: new ArrayBuffer(0),
      boundary: 'BOUND',
    });

    expect(decode(result.body)).toContain('\r\n\r\n\r\n--BOUND--');
  });
});
