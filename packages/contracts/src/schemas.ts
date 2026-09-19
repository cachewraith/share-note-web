import { z } from 'zod';
import { AssetIdSchema, Sha256HexSchema, ShareIdSchema } from './ids';
import { ALLOWED_IMAGE_MIME_TYPES, LIMITS, utf8ByteLength } from './limits';

const MarkdownSchema = z
  .string()
  .refine((value) => utf8ByteLength(value) <= LIMITS.markdownMaxBytes, {
    message: `Markdown exceeds ${String(LIMITS.markdownMaxBytes)} bytes`,
  });

const TitleSchema = z.string().trim().min(1).max(LIMITS.titleMaxLength);

const IsoDateTimeSchema = z.iso.datetime();

/* -------------------------------------------------------------------------- */
/* me                                                                          */
/* -------------------------------------------------------------------------- */

export const MeResponseSchema = z.object({
  userId: z.uuid(),
  email: z.email().nullable(),
  createdAt: IsoDateTimeSchema,
  apiKey: z.object({
    id: z.uuid(),
    name: z.string(),
    prefix: z.string(),
  }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/* -------------------------------------------------------------------------- */
/* shares (owner-scoped)                                                       */
/* -------------------------------------------------------------------------- */

export const CreateShareRequestSchema = z.object({
  title: TitleSchema,
  markdown: MarkdownSchema,
});
export type CreateShareRequest = z.infer<typeof CreateShareRequestSchema>;

export const UpdateShareRequestSchema = CreateShareRequestSchema;
export type UpdateShareRequest = z.infer<typeof UpdateShareRequestSchema>;

export const ShareRefSchema = z.object({
  id: ShareIdSchema,
  url: z.url(),
});
export type ShareRef = z.infer<typeof ShareRefSchema>;

export const CreateShareResponseSchema = ShareRefSchema.extend({
  contentHash: Sha256HexSchema,
});
export type CreateShareResponse = z.infer<typeof CreateShareResponseSchema>;

export const UpdateShareResponseSchema = CreateShareResponseSchema.extend({
  /** False when the submitted markdown hashed to the stored contentHash. */
  updated: z.boolean(),
});
export type UpdateShareResponse = z.infer<typeof UpdateShareResponseSchema>;

export const ShareSummarySchema = ShareRefSchema.extend({
  title: z.string(),
  contentHash: Sha256HexSchema,
  assetCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ShareSummary = z.infer<typeof ShareSummarySchema>;

export const LIST_SHARES_DEFAULT_LIMIT = 50;
export const LIST_SHARES_MAX_LIMIT = 200;

export const ListSharesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIST_SHARES_MAX_LIMIT)
    .default(LIST_SHARES_DEFAULT_LIMIT),
  /** Id of the last item of the previous page. */
  cursor: ShareIdSchema.optional(),
});
export type ListSharesQuery = z.infer<typeof ListSharesQuerySchema>;

export const ListSharesResponseSchema = z.object({
  shares: z.array(ShareSummarySchema),
  nextCursor: ShareIdSchema.nullable(),
});
export type ListSharesResponse = z.infer<typeof ListSharesResponseSchema>;

/* -------------------------------------------------------------------------- */
/* assets                                                                      */
/* -------------------------------------------------------------------------- */

export const AssetMimeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);

export const AssetRefSchema = z.object({
  id: AssetIdSchema,
  url: z.url(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const PublicAssetSchema = AssetRefSchema.extend({
  /**
   * The name the note refers to the attachment by, e.g. `diagram.png` for
   * `![[diagram.png]]`. The viewer resolves embeds against it.
   */
  filename: z.string(),
  mime: AssetMimeSchema,
  size: z.number().int().positive(),
  sha256: Sha256HexSchema,
});
export type PublicAsset = z.infer<typeof PublicAssetSchema>;

export const CreateAssetResponseSchema = PublicAssetSchema.extend({
  /** False when an attachment with the same filename and digest already existed. */
  created: z.boolean(),
});
export type CreateAssetResponse = z.infer<typeof CreateAssetResponseSchema>;

/* -------------------------------------------------------------------------- */
/* public (unauthenticated) viewer payloads                                    */
/* -------------------------------------------------------------------------- */

/** Deliberately carries no owner information of any kind. */
export const PublicShareResponseSchema = z.object({
  id: ShareIdSchema,
  title: z.string(),
  markdown: z.string(),
  contentHash: Sha256HexSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  assets: z.array(PublicAssetSchema),
});
export type PublicShareResponse = z.infer<typeof PublicShareResponseSchema>;

/* -------------------------------------------------------------------------- */
/* health                                                                      */
/* -------------------------------------------------------------------------- */

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const DependencyStatusSchema = z.enum(['up', 'down']);

export const ReadyResponseSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({
    database: DependencyStatusSchema,
    redis: DependencyStatusSchema,
    storage: DependencyStatusSchema,
  }),
});
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
