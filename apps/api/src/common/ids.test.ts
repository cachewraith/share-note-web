import { EditTokenSchema, PUBLIC_ID_ALPHABET, PublicIdSchema } from '@share-note/contracts';
import { describe, expect, it } from 'vitest';
import { generateEditToken, generatePublicId, hashPresentedEditToken } from './ids';
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

describe('generateEditToken', () => {
  it('produces a token the contract accepts', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(EditTokenSchema.safeParse(generateEditToken().token).success).toBe(true);
    }
  });

  it('hashes the whole token', () => {
    const generated = generateEditToken();
    expect(generated.tokenHash).toBe(sha256Hex(generated.token));
  });

  it('never leaks the secret into the hash that is persisted', () => {
    const generated = generateEditToken();
    const secret = generated.token.slice('snt_'.length);
    expect(secret).toHaveLength(43);
    expect(generated.tokenHash).not.toContain(secret);
  });

  it('does not repeat itself', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateEditToken().token);
    expect(seen.size).toBe(500);
  });
});

describe('hashPresentedEditToken', () => {
  it('agrees with the digest stored at creation', () => {
    const generated = generateEditToken();
    expect(hashPresentedEditToken(generated.token)).toBe(generated.tokenHash);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['wrong scheme', `snw_${'a'.repeat(43)}`],
    ['no prefix', 'a'.repeat(43)],
    ['secret one character short', `snt_${'a'.repeat(42)}`],
    ['secret one character long', `snt_${'a'.repeat(44)}`],
    ['non-alphabet secret', `snt_${'a'.repeat(42)}!`],
    ['leading whitespace', ` snt_${'a'.repeat(43)}`],
    ['newline injection', `snt_${'a'.repeat(43)}\n`],
    ['sql-ish payload', "snt_' OR 1=1 --"],
  ])('refuses %s before hashing it', (_label, value) => {
    expect(hashPresentedEditToken(value)).toBeNull();
  });
});
