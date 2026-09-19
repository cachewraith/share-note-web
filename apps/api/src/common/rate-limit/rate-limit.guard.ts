import { CanActivate, type ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_HEADER, AUTH_SCHEME } from '@share-note/contracts';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config';
import { REDIS_CLIENT } from '../../infra/redis/redis.module';
import { AppError } from '../app-error';
import { parseApiKey } from '../ids';
import { RATE_LIMIT_BUCKET, type RateLimitBucket } from './rate-limit.decorator';

/**
 * Fixed-window counter in Redis: `INCR` the window's key, set its TTL on first
 * use, compare against the budget. Fixed windows allow a burst of up to 2x the
 * limit across a window boundary, which is fine for the abuse this is here to
 * stop and costs one round trip instead of a sorted-set dance.
 *
 * Callers are identified by API-key prefix when they present one, falling back
 * to the client IP. The prefix is not a secret (see docs/decisions/0005), so it
 * is safe to put in a key; the key itself never is. Identifying by prefix means
 * one noisy user cannot spend another user's budget from behind the same NAT.
 *
 * On a Redis failure the guard **denies**. A rate limiter that fails open is a
 * security control that stops working exactly when the system is under stress
 * (OWASP A10). `/health` carries `@RateLimit('none')` so a probe still answers.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucket =
      this.reflector.getAllAndOverride<RateLimitBucket | undefined>(RATE_LIMIT_BUCKET, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read';

    if (bucket === 'none') return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const limit = this.limitFor(bucket);
    const windowSeconds = this.config.rateLimit.windowSeconds;
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${bucket}:${identify(request)}:${String(window)}`;

    const count = await this.increment(key, windowSeconds);
    const remaining = Math.max(0, limit - count);
    const resetSeconds = (window + 1) * windowSeconds - Math.floor(Date.now() / 1000);

    void reply.header('RateLimit-Limit', String(limit));
    void reply.header('RateLimit-Remaining', String(remaining));
    void reply.header('RateLimit-Reset', String(resetSeconds));

    if (count > limit) {
      void reply.header('Retry-After', String(resetSeconds));
      throw AppError.tooManyRequests(
        `Rate limit exceeded: ${String(limit)} ${bucket} requests per ${String(windowSeconds)}s`,
      );
    }

    return true;
  }

  private limitFor(bucket: Exclude<RateLimitBucket, 'none'>): number {
    switch (bucket) {
      case 'read':
        return this.config.rateLimit.readMax;
      case 'write':
        return this.config.rateLimit.writeMax;
      case 'public':
        return this.config.rateLimit.publicMax;
    }
  }

  private async increment(key: string, windowSeconds: number): Promise<number> {
    try {
      const results = await this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();

      const first = results?.[0];
      if (first?.[0] !== null || typeof first[1] !== 'number') {
        throw new Error('unexpected reply from INCR');
      }
      return first[1];
    } catch (error) {
      this.logger.error(`rate limit backend unavailable: ${String(error)}`);
      throw AppError.serviceUnavailable('Rate limiting is unavailable', error);
    }
  }
}

function identify(request: FastifyRequest): string {
  // See ApiKeyGuard for why this reads `raw.headers`.
  const raw = request.raw.headers[AUTH_HEADER];
  if (raw?.startsWith(`${AUTH_SCHEME} `)) {
    const parsed = parseApiKey(raw.slice(AUTH_SCHEME.length + 1).trim());
    if (parsed) return `k:${parsed.prefix}`;
  }
  // Fastify resolves this from X-Forwarded-For only when TRUST_PROXY is set.
  return `ip:${request.ip}`;
}
