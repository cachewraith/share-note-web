import { ApiKeySchema, PUBLIC_ID_ALPHABET, PublicIdSchema } from '@share-note/contracts';
import { describe, expect, it } from 'vitest';
import { generateApiKey, generatePublicId, parseApiKey } from './ids';
import { sha256Hex } from './hash';

describe('generatePublicId', () => {
  it('produces ids the contract accepts', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(PublicIdSchema.safeParse(generatePublicId()).success).toBe(true);
    }
  });

  it('honours an explicit length', () => {
    expect(generatePublicId(8)).toHaveLength(8);
  });

  it('only emits characters from the alphabet', () => {
    const id = generatePublicId(1000);
    for (const character of id) {
      expect(PUBLIC_ID_ALPHABET).toContain(character);
    }
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => generatePublicId()));
    expect(ids.size).toBe(5000);
  });

  it('uses the whole alphabet', () => {
    const seen = new Set(generatePublicId(20_000));
    expect(seen.size).toBe(PUBLIC_ID_ALPHABET.length);
  });
});

describe('generateApiKey', () => {
  it('produces a key the contract accepts', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(ApiKeySchema.safeParse(generateApiKey().key).success).toBe(true);
    }
  });

  it('hashes the whole key, not just the secret', () => {
    const generated = generateApiKey();
    expect(generated.keyHash).toBe(sha256Hex(generated.key));
  });

  it('never returns the secret in a field other than `key`', () => {
    const generated = generateApiKey();
    // Not `split('_')`: a base64url secret may itself contain underscores, and
    // comparing against a fragment of it would make this test flaky.
    const secret = generated.key.slice(`snw_${generated.prefix}_`.length);
    expect(secret).toHaveLength(43);
    expect(generated.prefix).not.toContain(secret);
    expect(generated.keyHash).not.toContain(secret);
  });
});

describe('parseApiKey', () => {
  it('round-trips a generated key, including secrets containing _ and -', () => {
    const generated = generateApiKey();
    const parsed = parseApiKey(generated.key);
    expect(parsed).toEqual({ prefix: generated.prefix, keyHash: generated.keyHash });
  });

  it('round-trips 200 generated keys', () => {
    for (let i = 0; i < 200; i += 1) {
      const generated = generateApiKey();
      expect(parseApiKey(generated.key)?.prefix).toBe(generated.prefix);
    }
  });

  it.each([
    ['empty', ''],
    ['wrong scheme', `key_abcd1234_${'a'.repeat(43)}`],
    ['too few parts', 'snw_abcd1234'],
    ['too many parts', `snw_abcd1234_${'a'.repeat(43)}_extra`],
    ['short prefix', `snw_abc_${'a'.repeat(43)}`],
    ['empty secret', 'snw_abcd1234_'],
    ['non-alphabet prefix', `snw_abcd12!4_${'a'.repeat(43)}`],
    ['secret one character short', `snw_abcd1234_${'a'.repeat(42)}`],
    ['leading whitespace', ` snw_abcd1234_${'a'.repeat(43)}`],
    ['newline injection', `snw_abcd1234_${'a'.repeat(43)}\n`],
    ['sql-ish payload', "snw_abcd1234_' OR 1=1 --"],
  ])('rejects %s', (_label, value) => {
    expect(parseApiKey(value)).toBeNull();
  });
});
