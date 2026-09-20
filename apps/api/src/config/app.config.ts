import { type Env, envSchema } from './env.schema';

/** The shape the rest of the app consumes. Grouped by concern, not by env name. */
export interface AppConfig {
  readonly env: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly host: string;
  readonly port: number;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly publicWebUrl: string;
  readonly publicApiUrl: string;
  readonly enableDocs: boolean;
  readonly runMigrationsOnStart: boolean;
  readonly trustProxy: boolean;
  readonly corsAllowedOrigins: readonly string[];
  readonly database: { readonly url: string };
  readonly redis: { readonly url: string };
  readonly storage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
  };
  readonly limits: {
    readonly markdownMaxBytes: number;
    readonly assetMaxBytes: number;
    readonly assetsPerShareMax: number;
  };
  readonly rateLimit: {
    readonly windowSeconds: number;
    readonly writeMax: number;
    readonly publicMax: number;
  };
}

export function toAppConfig(env: Env): AppConfig {
  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    publicWebUrl: env.PUBLIC_WEB_URL.replace(/\/+$/, ''),
    publicApiUrl: env.PUBLIC_API_URL.replace(/\/+$/, ''),
    enableDocs: env.ENABLE_DOCS,
    runMigrationsOnStart: env.RUN_MIGRATIONS_ON_START,
    trustProxy: env.TRUST_PROXY,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    storage: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    },
    limits: {
      markdownMaxBytes: env.MARKDOWN_MAX_BYTES,
      assetMaxBytes: env.ASSET_MAX_BYTES,
      assetsPerShareMax: env.ASSETS_PER_SHARE_MAX,
    },
    rateLimit: {
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      writeMax: env.RATE_LIMIT_WRITE_MAX,
      publicMax: env.RATE_LIMIT_PUBLIC_MAX,
    },
  };
}

/**
 * Parses and validates the process environment. Throws a message that names
 * every offending variable, so a misconfigured container says why it will not
 * start. Values are never echoed back — several of them are secrets.
 */
export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return toAppConfig(result.data);
}
