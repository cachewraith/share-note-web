import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';

describe('sha256Hex', () => {
  it('matches the known digest of the empty string', async () => {
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches the known digest of "abc"', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes a string and its utf-8 bytes identically', async () => {
    const bytes = new TextEncoder().encode('héllo');
    expect(await sha256Hex('héllo')).toBe(await sha256Hex(bytes));
  });

  it('accepts an ArrayBuffer', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await sha256Hex(bytes.buffer)).toBe(await sha256Hex(bytes));
  });

  it('gives a different digest for different bytes', async () => {
    expect(await sha256Hex(new Uint8Array([1, 2, 3]))).not.toBe(
      await sha256Hex(new Uint8Array([1, 2, 4])),
    );
  });

  it('always returns 64 lowercase hex characters', async () => {
    expect(await sha256Hex('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});
