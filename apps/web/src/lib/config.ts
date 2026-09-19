import { z } from 'zod';

/**
 * Every environment variable the viewer reads, validated once.
 *
 * None of them is a `NEXT_PUBLIC_` variable, on purpose: those are inlined at
 * build time, which would mean a Docker image that only works for the host it
 * was built for. The viewer is server-rendered, so it can read all of these at
 * runtime instead.
 */
const schema = z.object({
  /** Where the server reaches the API. Inside compose this is a service name. */
  API_INTERNAL_URL: z.url().default('http://localhost:3001'),
  /** Where a browser reaches the API. Attachment URLs and the CSP use it. */
  PUBLIC_API_URL: z.url().default('http://localhost:3001'),
  /** This app's own public origin, for canonical and OpenGraph URLs. */
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  /** How long a fetched note may be served before it is checked again. */
  SHARE_REVALIDATE_SECONDS: z.coerce.number().int().nonnegative().default(60),
});

export interface WebConfig {
  readonly apiInternalUrl: string;
  readonly publicApiUrl: string;
  readonly publicWebUrl: string;
  readonly shareRevalidateSeconds: number;
}

let cached: WebConfig | undefined;

export function getConfig(): WebConfig {
  if (cached) return cached;

  const result = schema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  cached = {
    apiInternalUrl: result.data.API_INTERNAL_URL.replace(/\/+$/, ''),
    publicApiUrl: result.data.PUBLIC_API_URL.replace(/\/+$/, ''),
    publicWebUrl: result.data.PUBLIC_WEB_URL.replace(/\/+$/, ''),
    shareRevalidateSeconds: result.data.SHARE_REVALIDATE_SECONDS,
  };
  return cached;
}
