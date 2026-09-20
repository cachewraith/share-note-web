import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type ApiError, ROUTES } from '@share-note/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap';
import { integrationEnv, waitForReady } from './harness';

/**
 * Runs against a second app instance with a deliberately tiny budget, so the
 * limiter is exercised for real (Redis included) without slowing the rest of
 * the suite down.
 */
let app: NestFastifyApplication;

/**
 * Two callers, distinguished the only way an anonymous API can: by address.
 *
 * Randomised per run because the limiter now keys on the address alone, and
 * Redis keeps each window for a minute — a fixed pair would inherit the
 * previous run's count and fail whenever the suite is run twice inside one
 * window.
 */
const octet = () => 1 + Math.floor(Math.random() * 250);
const CLIENT = `198.51.100.${String(octet())}`;
const OTHER_CLIENT = `203.0.113.${String(octet())}`;

beforeAll(async () => {
  Object.assign(process.env, integrationEnv(), {
    RATE_LIMIT_WINDOW_SECONDS: '60',
    RATE_LIMIT_WRITE_MAX: '3',
    RATE_LIMIT_PUBLIC_MAX: '1000',
  });
  ({ app } = await createApp());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await waitForReady(app);
}, 60_000);

afterAll(async () => {
  await app?.close();
});

function write(remoteAddress: string) {
  return app.inject({
    method: 'POST',
    url: ROUTES.shares,
    headers: { 'content-type': 'application/json' },
    remoteAddress,
    payload: { title: 'rate limited', markdown: 'x' },
  });
}

describe('rate limiting', () => {
  it('refuses writes past the budget and says when to retry', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await write(CLIENT)).statusCode);
    }

    expect(statuses.filter((status) => status === 201)).toHaveLength(3);
    expect(statuses.filter((status) => status === 429)).toHaveLength(2);

    const refused = await write(CLIENT);
    expect(refused.json<ApiError>().error.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not spend one caller budget on another', async () => {
    // The first address is already exhausted by the test above.
    expect((await write(CLIENT)).statusCode).toBe(429);
    expect((await write(OTHER_CLIENT)).statusCode).toBe(201);
  });

  it('leaves the liveness probe alone', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await app.inject({ method: 'GET', url: ROUTES.health })).statusCode).toBe(200);
    }
  });

  it('applies a separate, larger budget to public reads', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.publicShare('aaaaaaaaaaaaaaaaaaaaa'),
      remoteAddress: CLIENT,
    });
    expect(response.statusCode).toBe(404);
    expect(response.headers['ratelimit-limit']).toBe('1000');
  });
});
