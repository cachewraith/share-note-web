import {
  API_KEY_PATTERN,
  isAllowedImageMimeType,
  isErrorCode,
  PUBLIC_ID_PATTERN,
  SHA256_HEX_PATTERN,
} from './constants';
// Type-only: erased at compile time, so this module stays free of zod at runtime.
import type {
  CreateAssetResponse,
  CreateShareResponse,
  MeResponse,
  PublicShareResponse,
  UpdateShareResponse,
} from './schemas';
import type { ApiError } from './errors';

/**
 * Hand-written structural checks, mirroring the zod schemas.
 *
 * They exist for one consumer: the Obsidian plugin, which runs on phones and
 * would otherwise ship ~450 KB of zod to validate a handful of flat objects
 * (see docs/decisions/0013). Everything server-side keeps using the schemas.
 *
 * `guards.test.ts` checks every guard against its schema over a corpus of valid
 * and invalid payloads, so the mirror cannot drift out of step unnoticed.
 */

export function isApiKey(value: unknown): value is string {
  return typeof value === 'string' && API_KEY_PATTERN.test(value);
}

export function isPublicId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_ID_PATTERN.test(value);
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX_PATTERN.test(value);
}

export function isApiError(value: unknown): value is ApiError {
  const error = field(value, 'error');
  return (
    isRecord(error) &&
    isErrorCode(error.code) &&
    typeof error.message === 'string' &&
    (error.details === undefined || isDetailList(error.details))
  );
}

export function isMeResponse(value: unknown): value is MeResponse {
  if (!isRecord(value)) return false;
  const apiKey = value.apiKey;

  return (
    isUuid(value.userId) &&
    (value.email === null || isEmail(value.email)) &&
    isIsoDateTime(value.createdAt) &&
    isRecord(apiKey) &&
    isUuid(apiKey.id) &&
    typeof apiKey.name === 'string' &&
    typeof apiKey.prefix === 'string'
  );
}

export function isCreateShareResponse(value: unknown): value is CreateShareResponse {
  return (
    isRecord(value) && isPublicId(value.id) && isUrl(value.url) && isSha256Hex(value.contentHash)
  );
}

export function isUpdateShareResponse(value: unknown): value is UpdateShareResponse {
  return isCreateShareResponse(value) && typeof field(value, 'updated') === 'boolean';
}

export function isCreateAssetResponse(value: unknown): value is CreateAssetResponse {
  return isPublicAsset(value) && typeof field(value, 'created') === 'boolean';
}

export function isPublicShareResponse(value: unknown): value is PublicShareResponse {
  return (
    isRecord(value) &&
    isPublicId(value.id) &&
    typeof value.title === 'string' &&
    typeof value.markdown === 'string' &&
    isSha256Hex(value.contentHash) &&
    isIsoDateTime(value.createdAt) &&
    isIsoDateTime(value.updatedAt) &&
    Array.isArray(value.assets) &&
    value.assets.every(isPublicAsset)
  );
}

function isPublicAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    isPublicId(value.id) &&
    isUrl(value.url) &&
    typeof value.filename === 'string' &&
    typeof value.mime === 'string' &&
    isAllowedImageMimeType(value.mime) &&
    isPositiveInteger(value.size) &&
    isSha256Hex(value.sha256)
  );
}

/* ------------------------------------------------------------- helpers --- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined;
}

function isDetailList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) && typeof entry.path === 'string' && typeof entry.message === 'string',
    )
  );
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Matches what zod's `z.email()` accepts closely enough for a response check. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function isEmail(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_PATTERN.test(value);
}

function isUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** `z.iso.datetime()`: RFC 3339 with a `Z` offset. */
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isIsoDateTime(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
