import { z } from 'zod';
import { AssetIdSchema, EditTokenSchema, Sha256HexSchema, ShareIdSchema } from './ids';
import { ALLOWED_IMAGE_MIME_TYPES, LIMITS, utf8ByteLength } from './constants';

const MarkdownSchema = z
  .string()
  .refine((value) => utf8ByteLength(value) <= LIMITS.markdownMaxBytes, {
    message: `Markdown exceeds ${String(LIMITS.markdownMaxBytes)} bytes`,
  });

const TitleSchema = z.string().trim().min(1).max(LIMITS.titleMaxLength);

const IsoDateTimeSchema = z.iso.datetime();

/* -------------------------------------------------------------------------- */
/* shares                                                                      */
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
  /**
   * Returned exactly once, on creation. Present it to replace or delete this
   * share; the server keeps only its hash and cannot reissue it. Losing it
   * means the note stays published and can no longer be changed or taken down
   * through the API.
   */
  editToken: EditTokenSchema,
});
export type CreateShareResponse = z.infer<typeof CreateShareResponseSchema>;

export const UpdateShareResponseSchema = ShareRefSchema.extend({
  contentHash: Sha256HexSchema,
  /** False when the submitted markdown hashed to the stored contentHash. */
  updated: z.boolean(),
});
export type UpdateShareResponse = z.infer<typeof UpdateShareResponseSchema>;

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
