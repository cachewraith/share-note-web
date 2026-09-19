import { describe, expect, it } from 'vitest';
import { sha256Hex, timingSafeEqualHex } from './hash';

describe('sha256Hex', () => {
  it('matches the known digest of the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes strings and buffers identically', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex(Buffer.from('abc', 'utf8')));
  });

  it('is sensitive to utf-8 content', () => {
    expect(sha256Hex('é')).not.toBe(sha256Hex('e'));
  });
});

describe('timingSafeEqualHex', () => {
  const digest = sha256Hex('secret');

  it('accepts identical digests', () => {
    expect(timingSafeEqualHex(digest, sha256Hex('secret'))).toBe(true);
  });

  it('rejects a different digest', () => {
    expect(timingSafeEqualHex(digest, sha256Hex('secret2'))).toBe(false);
  });

  it('rejects a length mismatch instead of throwing', () => {
    expect(timingSafeEqualHex(digest, 'abc')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(timingSafeEqualHex('', '')).toBe(false);
  });

  it('rejects non-hex input instead of throwing', () => {
    expect(timingSafeEqualHex(digest, 'z'.repeat(64))).toBe(false);
  });
});
