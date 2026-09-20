/**
 * The contract without zod.
 *
 * Same routes, limits, identifier shapes and error codes as the main entry
 * point, with hand-written guards in place of schemas. Import this when bundle
 * size matters — the Obsidian plugin does, because it runs on phones.
 *
 * Anything server-side should import `@share-note/contracts` instead and get
 * the schemas, which parse and coerce rather than only check.
 */
export * from './constants';
export * from './guards';
export type { ApiError } from './errors';
export type {
  CreateAssetResponse,
  CreateShareRequest,
  CreateShareResponse,
  PublicAsset,
  PublicShareResponse,
  ReadyResponse,
  UpdateShareRequest,
  UpdateShareResponse,
} from './schemas';
