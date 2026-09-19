import { SetMetadata } from '@nestjs/common';

/**
 * Which budget a route draws from. `write` is deliberately much smaller than
 * `read`; `none` is for liveness probes, which must answer even while the API is
 * shedding load.
 */
export type RateLimitBucket = 'read' | 'write' | 'public' | 'none';

export const RATE_LIMIT_BUCKET = 'share-note:rate-limit-bucket';

export const RateLimit = (bucket: RateLimitBucket) => SetMetadata(RATE_LIMIT_BUCKET, bucket);
