import { describe, expect, it } from 'vitest';
import { ApiErrorSchema } from './errors';
import {
  isApiError,
  isCreateAssetResponse,
  isCreateShareResponse,
  isEditToken,
  isPublicId,
  isReadyResponse,
  isPublicShareResponse,
  isSha256Hex,
  isUpdateShareResponse,
} from './guards';
import { EditTokenSchema, PublicIdSchema, Sha256HexSchema } from './ids';
import {
  CreateAssetResponseSchema,
  CreateShareResponseSchema,
  PublicShareResponseSchema,
  ReadyResponseSchema,
  UpdateShareResponseSchema,
} from './schemas';

const ID = 'abcDEF123_-abcDEF1234';
const HASH = 'a'.repeat(64);
const TOKEN = `snt_${'a'.repeat(43)}`;

const asset = {
  id: ID,
  url: 'https://api.example.com/v1/public/assets/abcDEF123_-abcDEF1234',
  filename: 'a.png',
  mime: 'image/png',
  size: 12,
  sha256: HASH,
};

const share = {
  id: ID,
  url: 'https://notes.example.com/abcDEF123_-abcDEF1234',
  contentHash: HASH,
};

const created = { ...share, editToken: TOKEN };

const ready = {
  status: 'ready',
  checks: { database: 'up', redis: 'up', storage: 'up' },
};

const publicShare = {
  id: ID,
  title: 'Note',
  markdown: '# Note',
  contentHash: HASH,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  assets: [asset],
};

/** Mutations that should make a payload invalid, applied to a valid one. */
function corruptions(valid: Record<string, unknown>): unknown[] {
  const broken: unknown[] = [undefined, null, 0, '', 'string', [], true];

  for (const key of Object.keys(valid)) {
    const withoutKey = { ...valid };
    delete withoutKey[key];
    broken.push(withoutKey, { ...valid, [key]: null }, { ...valid, [key]: 42 });
  }
  return broken;
}

/**
 * The guards in `guards.ts` are hand-written mirrors of the zod schemas. These
 * tests are what stop the two drifting apart: each guard has to agree with its
 * schema on a valid payload and on every way of breaking it.
 */
const cases = [
  ['isEditToken', isEditToken, (value: unknown) => EditTokenSchema.safeParse(value).success, TOKEN],
  ['isPublicId', isPublicId, (value: unknown) => PublicIdSchema.safeParse(value).success, ID],
  ['isSha256Hex', isSha256Hex, (value: unknown) => Sha256HexSchema.safeParse(value).success, HASH],
] as const;

describe('scalar guards agree with their schemas', () => {
  it.each(cases)('%s', (_name, guard, schema, valid) => {
    const samples: unknown[] = [
      valid,
      undefined,
      null,
      0,
      '',
      [],
      {},
      `${valid} `,
      ` ${valid}`,
      `${valid}x`,
      String(valid).slice(0, -1),
      String(valid).toUpperCase(),
    ];

    for (const sample of samples) {
      expect(guard(sample), `disagreed on ${JSON.stringify(sample)}`).toBe(schema(sample));
    }
  });
});

describe('object guards agree with their schemas', () => {
  const objectCases = [
    [
      'isCreateShareResponse',
      isCreateShareResponse,
      (value: unknown) => CreateShareResponseSchema.safeParse(value).success,
      created,
    ],
    [
      'isUpdateShareResponse',
      isUpdateShareResponse,
      (value: unknown) => UpdateShareResponseSchema.safeParse(value).success,
      { ...share, updated: true },
    ],
    [
      'isCreateAssetResponse',
      isCreateAssetResponse,
      (value: unknown) => CreateAssetResponseSchema.safeParse(value).success,
      { ...asset, created: true },
    ],
    [
      'isReadyResponse',
      isReadyResponse,
      (value: unknown) => ReadyResponseSchema.safeParse(value).success,
      ready,
    ],
    [
      'isPublicShareResponse',
      isPublicShareResponse,
      (value: unknown) => PublicShareResponseSchema.safeParse(value).success,
      publicShare,
    ],
    [
      'isApiError',
      isApiError,
      (value: unknown) => ApiErrorSchema.safeParse(value).success,
      { error: { code: 'NOT_FOUND', message: 'No such share' } },
    ],
  ] as const;

  it.each(objectCases)('%s accepts a valid payload', (_name, guard, schema, valid) => {
    expect(guard(valid)).toBe(true);
    expect(schema(valid)).toBe(true);
  });

  it.each(objectCases)(
    '%s rejects everything the schema rejects',
    (_name, guard, schema, valid) => {
      for (const sample of corruptions(valid)) {
        expect(guard(sample), `disagreed on ${JSON.stringify(sample)}`).toBe(schema(sample));
      }
    },
  );
});

describe('guards catch the cases the plugin actually hits', () => {
  it('rejects an html error page', () => {
    expect(isCreateShareResponse('<!doctype html>')).toBe(false);
    expect(isApiError('<!doctype html>')).toBe(false);
  });

  it('rejects an svg attachment type', () => {
    expect(isCreateAssetResponse({ ...asset, mime: 'image/svg+xml', created: true })).toBe(false);
  });

  it('rejects a share id of the wrong length', () => {
    expect(isCreateShareResponse({ ...created, id: 'short' })).toBe(false);
  });

  it('rejects a create response with no edit token, which would strand the note', () => {
    expect(isCreateShareResponse(share)).toBe(false);
  });

  it('accepts an error body with validation details', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ path: 'title', message: 'Too small' }],
      },
    };
    expect(isApiError(body)).toBe(true);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
  });

  it('rejects an unknown error code, so a new one is noticed rather than mishandled', () => {
    expect(isApiError({ error: { code: 'TEAPOT', message: 'no' } })).toBe(false);
  });
});
