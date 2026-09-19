import { describe, expect, it } from 'vitest';
import { ApiKeySchema, PublicIdSchema } from './ids';
import { isAllowedImageMimeType, LIMITS, utf8ByteLength } from './limits';
import {
  CreateShareRequestSchema,
  ListSharesQuerySchema,
  PublicShareResponseSchema,
} from './schemas';
import { joinUrl, ROUTES } from './routes';

describe('PublicIdSchema', () => {
  it('accepts a 21 character url-safe id', () => {
    expect(PublicIdSchema.safeParse('abcDEF123_-abcDEF1234').success).toBe(true);
  });

  it.each(['short', 'abcDEF123_-abcDEF123456', 'abcDEF123_-abcDEF123/'])('rejects %s', (value) => {
    expect(PublicIdSchema.safeParse(value).success).toBe(false);
  });
});

describe('ApiKeySchema', () => {
  const valid = `snw_abcd1234_${'a'.repeat(43)}`;

  it('accepts the wire format', () => {
    expect(ApiKeySchema.safeParse(valid).success).toBe(true);
  });

  it.each(['snw_abcd1234_short', `key_abcd1234_${'a'.repeat(43)}`, ''])('rejects %s', (value) => {
    expect(ApiKeySchema.safeParse(value).success).toBe(false);
  });
});

describe('CreateShareRequestSchema', () => {
  it('trims the title', () => {
    const parsed = CreateShareRequestSchema.parse({ title: '  Note  ', markdown: '# hi' });
    expect(parsed.title).toBe('Note');
  });

  it('rejects an empty title', () => {
    expect(CreateShareRequestSchema.safeParse({ title: '   ', markdown: 'x' }).success).toBe(false);
  });

  it('accepts empty markdown', () => {
    expect(CreateShareRequestSchema.safeParse({ title: 'Note', markdown: '' }).success).toBe(true);
  });

  it('measures the markdown limit in utf-8 bytes, not code units', () => {
    // Each euro sign is 3 bytes, so this is over the limit despite being
    // roughly a third of the limit in JS string length.
    const markdown = '€'.repeat(LIMITS.markdownMaxBytes / 3 + 1);
    expect(utf8ByteLength(markdown)).toBeGreaterThan(LIMITS.markdownMaxBytes);
    expect(CreateShareRequestSchema.safeParse({ title: 'Note', markdown }).success).toBe(false);
  });
});

describe('ListSharesQuerySchema', () => {
  it('applies the default limit', () => {
    expect(ListSharesQuerySchema.parse({}).limit).toBe(50);
  });

  it('coerces a string limit from the query string', () => {
    expect(ListSharesQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('rejects a limit above the maximum', () => {
    expect(ListSharesQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});

describe('PublicShareResponseSchema', () => {
  it('has no owner field', () => {
    expect(Object.keys(PublicShareResponseSchema.shape)).not.toContain('ownerId');
  });
});

describe('mime allowlist', () => {
  it('accepts the four raster formats', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(isAllowedImageMimeType(mime)).toBe(true);
    }
  });

  it('rejects svg', () => {
    expect(isAllowedImageMimeType('image/svg+xml')).toBe(false);
  });
});

describe('routes', () => {
  it('builds share paths', () => {
    expect(ROUTES.share('abc')).toBe('/v1/shares/abc');
    expect(ROUTES.publicAsset('abc')).toBe('/v1/public/assets/abc');
  });

  it('joins a base url and a path without doubling slashes', () => {
    expect(joinUrl('https://example.com/', '/v1/me')).toBe('https://example.com/v1/me');
    expect(joinUrl('https://example.com', 'v1/me')).toBe('https://example.com/v1/me');
  });
});
