import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  normaliseSettings,
  normaliseServerUrl,
  SETTINGS_PROBLEM_MESSAGES,
  validateSettings,
  type ShareNoteSettings,
} from './settings';

const settings = (overrides: Partial<ShareNoteSettings> = {}): ShareNoteSettings => ({
  ...DEFAULT_SETTINGS,
  serverUrl: 'https://notes.example.com',
  ...overrides,
});

describe('normaliseServerUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normaliseServerUrl('  https://notes.example.com//  ')).toBe('https://notes.example.com');
  });
});

describe('normaliseSettings', () => {
  it('fills in defaults for an empty file', () => {
    expect(normaliseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('survives a hand-edited data.json with wrong types', () => {
    expect(normaliseSettings({ serverUrl: 42, copyLinkAfterShare: 'yes' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('keeps a well-formed upload record', () => {
    const parsed = normaliseSettings({
      uploads: { abcdefghijklmnopqrstu: { 'a.png': 'f'.repeat(64) } },
    });
    expect(parsed.uploads).toEqual({ abcdefghijklmnopqrstu: { 'a.png': 'f'.repeat(64) } });
  });

  it('drops malformed upload records', () => {
    const parsed = normaliseSettings({
      uploads: { a: 'not-an-object', b: { 'x.png': 7 }, c: null },
    });
    expect(parsed.uploads).toEqual({});
  });
});

describe('validateSettings', () => {
  it('accepts a complete https configuration', () => {
    expect(validateSettings(settings())).toBeNull();
  });

  it('reports a missing server url first', () => {
    expect(validateSettings(settings({ serverUrl: '' }))).toBe('missing-server-url');
  });

  it('reports an unparseable server url', () => {
    expect(validateSettings(settings({ serverUrl: 'notes.example.com' }))).toBe(
      'invalid-server-url',
    );
  });

  it('rejects a non-http scheme', () => {
    expect(validateSettings(settings({ serverUrl: 'ftp://notes.example.com' }))).toBe(
      'invalid-server-url',
    );
  });

  it('refuses plain http to a remote host, which would expose the key', () => {
    expect(validateSettings(settings({ serverUrl: 'http://notes.example.com' }))).toBe(
      'insecure-server-url',
    );
  });

  it.each(['http://localhost:3001', 'http://127.0.0.1:3001', 'http://[::1]:3001'])(
    'allows plain http to %s for local development',
    (serverUrl) => {
      expect(validateSettings(settings({ serverUrl }))).toBeNull();
    },
  );

  it('needs nothing but a server url, because there is no key to configure', () => {
    expect(validateSettings(settings())).toBeNull();
  });

  it('drops an api key left in a data.json written by an older version', () => {
    const parsed = normaliseSettings({
      serverUrl: 'https://notes.example.com',
      apiKey: `snw_abcd1234_${'a'.repeat(43)}`,
    });

    expect(parsed).not.toHaveProperty('apiKey');
    expect(validateSettings(parsed)).toBeNull();
  });

  it('has a message for every problem it can report', () => {
    for (const problem of Object.keys(SETTINGS_PROBLEM_MESSAGES)) {
      expect(SETTINGS_PROBLEM_MESSAGES[problem as keyof typeof SETTINGS_PROBLEM_MESSAGES]).toMatch(
        /\S/,
      );
    }
  });
});
