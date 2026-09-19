import { describe, expect, it } from 'vitest';
import { loadConfig } from './app.config';

const validEnv = {
  PUBLIC_WEB_URL: 'https://notes.example.com/',
  PUBLIC_API_URL: 'https://api.example.com',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'share-note',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('applies defaults and normalises urls', () => {
    const config = loadConfig({ ...validEnv });
    expect(config.publicWebUrl).toBe('https://notes.example.com');
    expect(config.port).toBe(3001);
    expect(config.enableDocs).toBe(false);
    expect(config.storage.forcePathStyle).toBe(true);
    expect(config.rateLimit.writeMax).toBe(30);
  });

  it('names every missing variable', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({})).toThrow(/S3_BUCKET/);
  });

  it('never echoes a secret in the failure message', () => {
    try {
      loadConfig({ ...validEnv, PORT: 'not-a-port' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('PORT');
      expect((error as Error).message).not.toContain('secret');
    }
  });

  it('refuses to enable docs in production', () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'production', ENABLE_DOCS: 'true' })).toThrow(
      /ENABLE_DOCS/,
    );
  });

  it('allows docs outside production', () => {
    expect(
      loadConfig({ ...validEnv, NODE_ENV: 'development', ENABLE_DOCS: 'true' }).enableDocs,
    ).toBe(true);
  });

  it('refuses a limit above the protocol maximum', () => {
    expect(() => loadConfig({ ...validEnv, ASSET_MAX_BYTES: '999999999' })).toThrow(
      /ASSET_MAX_BYTES/,
    );
  });

  it('parses a comma separated origin list', () => {
    const config = loadConfig({
      ...validEnv,
      CORS_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com ',
    });
    expect(config.corsAllowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });
});
