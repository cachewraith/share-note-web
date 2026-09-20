import { SetMetadata } from '@nestjs/common';

/**
 * Which budget a route draws from. `write` is deliberately much smaller than
 * `public`: publishing costs storage, reading does not. `none` is for liveness
 * probes, which must answer even while the API is shedding load.
 *
 * A route that declares nothing gets `write`, the strictest of the three, so
 * forgetting the decorator fails safe.
 */
export type RateLimitBucket = 'write' | 'public' | 'none';

export const RATE_LIMIT_BUCKET = 'share-note:rate-limit-bucket';

export const RateLimit = (bucket: RateLimitBucket) => SetMetadata(RATE_LIMIT_BUCKET, bucket);
