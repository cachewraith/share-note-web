import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type ApiError, ROUTES } from '@share-note/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap';
import { integrationEnv, seedUser } from './harness';

/**
 * Runs against a second app instance with a deliberately tiny budget, so the
 * limiter is exercised for real (Redis included) without slowing the rest of
 * the suite down.
 */
let app: NestFastifyApplication;
let key: string;
let otherKey: string;

beforeAll(async () => {
  Object.assign(process.env, integrationEnv(), {
    RATE_LIMIT_WINDOW_SECONDS: '60',
    RATE_LIMIT_WRITE_MAX: '3',
    RATE_LIMIT_READ_MAX: '1000',
    RATE_LIMIT_PUBLIC_MAX: '1000',
  });
  ({ app } = await createApp());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  ({ key } = await seedUser(app));
  ({ key: otherKey } = await seedUser(app));
}, 60_000);

afterAll(async () => {
  await app?.close();
});

function write(token: string) {
  return app.inject({
    method: 'POST',
    url: ROUTES.shares,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: { title: 'rate limited', markdown: 'x' },
  });
}

describe('rate limiting', () => {
  it('refuses writes past the budget and says when to retry', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await write(key)).statusCode);
    }

    expect(statuses.filter((status) => status === 201)).toHaveLength(3);
    expect(statuses.filter((status) => status === 429)).toHaveLength(2);

    const refused = await write(key);
    expect(refused.json<ApiError>().error.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not spend one key budget on another', async () => {
    // The first key is already exhausted by the test above.
    expect((await write(key)).statusCode).toBe(429);
    expect((await write(otherKey)).statusCode).toBe(201);
  });

  it('leaves the liveness probe alone', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await app.inject({ method: 'GET', url: ROUTES.health })).statusCode).toBe(200);
    }
  });

  it('applies a separate, larger budget to reads', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.me,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['ratelimit-limit']).toBe('1000');
  });
});
