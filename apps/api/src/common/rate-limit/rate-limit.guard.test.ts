import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testConfig } from '../../../test/fixtures';
import { generateApiKey } from '../ids';
import { type RateLimitBucket, RATE_LIMIT_BUCKET } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';

function contextFor(options: { headers?: Record<string, string>; ip?: string } = {}) {
  const headers = options.headers ?? {};
  const reply = { header: vi.fn() };
  const request = { raw: { headers }, ip: options.ip ?? '203.0.113.9' };
  return {
    context: {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
    } as unknown as ExecutionContext,
    reply,
  };
}

/** A Redis double whose INCR replies come from a script the test controls. */
function redisReturning(counts: number[]): Redis {
  let call = 0;
  return {
    multi: () => ({
      incr: () => ({
        expire: () => ({
          exec: () => {
            const count = counts[Math.min(call, counts.length - 1)] ?? 1;
            call += 1;
            return Promise.resolve([
              [null, count],
              [null, 1],
            ]);
          },
        }),
      }),
    }),
  } as unknown as Redis;
}

describe('RateLimitGuard', () => {
  const reflector = new Reflector();
  const config = testConfig({ RATE_LIMIT_WRITE_MAX: '2', RATE_LIMIT_READ_MAX: '5' });

  function guardWith(redis: Redis, bucket: RateLimitBucket) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(bucket);
    return new RateLimitGuard(reflector, redis, config);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows a request inside the budget', async () => {
    const { context, reply } = contextFor();
    await expect(guardWith(redisReturning([1]), 'write').canActivate(context)).resolves.toBe(true);
    expect(reply.header).toHaveBeenCalledWith('RateLimit-Remaining', '1');
  });

  it('refuses once the budget is spent and says when to retry', async () => {
    const { context, reply } = contextFor();

    await expect(
      guardWith(redisReturning([3]), 'write').canActivate(context),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(reply.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('skips the budget entirely for probes', async () => {
    const { context } = contextFor();
    const redis = redisReturning([999]);
    await expect(guardWith(redis, 'none').canActivate(context)).resolves.toBe(true);
  });

  it('denies rather than failing open when redis is unreachable', async () => {
    const broken = {
      multi: () => ({
        incr: () => ({
          expire: () => ({
            exec: () => Promise.reject(new Error('ECONNREFUSED')),
          }),
        }),
      }),
    } as unknown as Redis;
    const { context } = contextFor();

    await expect(guardWith(broken, 'write').canActivate(context)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('applies the write budget, which is smaller than the read budget', async () => {
    const { context: writeContext } = contextFor();
    await expect(
      guardWith(redisReturning([3]), 'write').canActivate(writeContext),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });

    const { context: readContext } = contextFor();
    await expect(guardWith(redisReturning([3]), 'read').canActivate(readContext)).resolves.toBe(
      true,
    );
  });

  it('keys authenticated callers by key prefix, not by shared ip', async () => {
    const seen: string[] = [];
    const recording = {
      multi: () => ({
        incr: (key: string) => {
          seen.push(key);
          return {
            expire: () => ({
              exec: () => Promise.resolve([[null, 1] as const, [null, 1] as const]),
            }),
          };
        },
      }),
    } as unknown as Redis;

    const first = generateApiKey();
    const second = generateApiKey();

    await guardWith(recording, 'write').canActivate(
      contextFor({ headers: { authorization: `Bearer ${first.key}` }, ip: '198.51.100.7' }).context,
    );
    await guardWith(recording, 'write').canActivate(
      contextFor({ headers: { authorization: `Bearer ${second.key}` }, ip: '198.51.100.7' })
        .context,
    );

    expect(seen[0]).toContain(`k:${first.prefix}`);
    expect(seen[1]).toContain(`k:${second.prefix}`);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('never puts the key itself in the redis key', async () => {
    const seen: string[] = [];
    const recording = {
      multi: () => ({
        incr: (key: string) => {
          seen.push(key);
          return {
            expire: () => ({
              exec: () => Promise.resolve([[null, 1] as const, [null, 1] as const]),
            }),
          };
        },
      }),
    } as unknown as Redis;

    const generated = generateApiKey();
    await guardWith(recording, 'write').canActivate(
      contextFor({ headers: { authorization: `Bearer ${generated.key}` } }).context,
    );

    const secret = generated.key.slice(`snw_${generated.prefix}_`.length);
    expect(seen[0]).not.toContain(secret);
  });

  it('falls back to the client ip when no key is presented', async () => {
    const seen: string[] = [];
    const recording = {
      multi: () => ({
        incr: (key: string) => {
          seen.push(key);
          return {
            expire: () => ({
              exec: () => Promise.resolve([[null, 1] as const, [null, 1] as const]),
            }),
          };
        },
      }),
    } as unknown as Redis;

    await guardWith(recording, 'public').canActivate(contextFor({ ip: '192.0.2.4' }).context);

    expect(seen[0]).toContain('ip:192.0.2.4');
  });

  it('ignores a malformed authorization header and keys by ip', async () => {
    const seen: string[] = [];
    const recording = {
      multi: () => ({
        incr: (key: string) => {
          seen.push(key);
          return {
            expire: () => ({
              exec: () => Promise.resolve([[null, 1] as const, [null, 1] as const]),
            }),
          };
        },
      }),
    } as unknown as Redis;

    await guardWith(recording, 'public').canActivate(
      contextFor({ headers: { authorization: 'Bearer nonsense' }, ip: '192.0.2.4' }).context,
    );

    expect(seen[0]).toContain('ip:192.0.2.4');
  });

  it('reads the bucket from route metadata', () => {
    const spy = vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('write');
    const guard = new RateLimitGuard(reflector, redisReturning([1]), config);
    void guard.canActivate(contextFor().context);
    expect(spy).toHaveBeenCalledWith(RATE_LIMIT_BUCKET, expect.any(Array));
  });
});
