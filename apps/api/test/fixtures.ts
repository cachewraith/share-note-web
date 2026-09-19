import { type AppConfig, toAppConfig } from '../src/config';
import { envSchema } from '../src/config/env.schema';

const BASE_ENV = {
  PUBLIC_WEB_URL: 'https://notes.example.com',
  PUBLIC_API_URL: 'https://api.example.com',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'share-note',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
} satisfies NodeJS.ProcessEnv;

/** A valid config for unit tests, with any field overridden as needed. */
export function testConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  return toAppConfig(envSchema.parse({ ...BASE_ENV, ...overrides }));
}
