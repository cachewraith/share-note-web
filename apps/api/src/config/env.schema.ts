import { LIMITS } from '@share-note/contracts';
import { z } from 'zod';

/**
 * Every environment variable the API reads, in one schema. Nothing else in the
 * codebase touches `process.env`; the app refuses to boot on an invalid value.
 */

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true' || value === '1');

const port = z.coerce.number().int().min(1).max(65_535);

const commaSeparatedList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: port.default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /** Where the viewer is served from; share links are built against it. */
    PUBLIC_WEB_URL: z.url(),
    /** Where this API is reachable from the public internet; asset links use it. */
    PUBLIC_API_URL: z.url(),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    /** MinIO and most self-hosted gateways need path-style addressing. */
    S3_FORCE_PATH_STYLE: booleanFromEnv(true),

    /** Serve the OpenAPI UI at /docs. Refused in production (see refine below). */
    ENABLE_DOCS: booleanFromEnv(false),
    /** Run `prisma migrate deploy` during bootstrap. */
    RUN_MIGRATIONS_ON_START: booleanFromEnv(false),
    /** Read client IPs from X-Forwarded-For. Only enable behind a proxy you control. */
    TRUST_PROXY: booleanFromEnv(false),

    /** Browser origins allowed to call the API. Empty means "same origin only". */
    CORS_ALLOWED_ORIGINS: commaSeparatedList,

    MARKDOWN_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.markdownMaxBytes)
      .default(LIMITS.markdownMaxBytes),
    ASSET_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.assetMaxBytes)
      .default(LIMITS.assetMaxBytes),
    ASSETS_PER_SHARE_MAX: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.assetsPerShareMax)
      .default(LIMITS.assetsPerShareMax),

    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_READ_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_WRITE_MAX: z.coerce.number().int().positive().default(30),
    /**
     * Shared by every reader: the server-rendered viewer calls the public
     * endpoints from a single address, so this bounds total page views per
     * window rather than per reader. Per-reader limiting belongs at the proxy.
     */
    RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().positive().default(600),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.ENABLE_DOCS), {
    message: 'ENABLE_DOCS must be false when NODE_ENV=production',
    path: ['ENABLE_DOCS'],
  });

export type Env = z.infer<typeof envSchema>;
