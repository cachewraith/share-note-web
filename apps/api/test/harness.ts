import { createHash, randomUUID } from 'node:crypto';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { generateApiKey } from '../src/common/ids';
import { PrismaService } from '../src/infra/prisma/prisma.service';

/**
 * Integration tests run against the services in docker-compose.yml. The URLs
 * come from TEST_* variables so a developer's own stack and CI can differ; they
 * are required rather than defaulted, because a test that silently points at a
 * developer's real database would be worse than one that refuses to run.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Start the stack with "docker compose up -d --wait" and export the TEST_* variables (see docs/self-hosting.md).`,
    );
  }
  return value;
}

export function integrationEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PUBLIC_WEB_URL: 'http://web.test',
    PUBLIC_API_URL: 'http://api.test',
    DATABASE_URL: required('TEST_DATABASE_URL'),
    REDIS_URL: required('TEST_REDIS_URL'),
    S3_ENDPOINT: required('TEST_S3_ENDPOINT'),
    S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'share-note',
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? 'share_note',
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'share_note_dev_secret',
    S3_FORCE_PATH_STYLE: 'true',
    ENABLE_DOCS: 'false',
    // High enough that ordinary assertions do not trip it; the rate limit has
    // its own test that sets its own budget.
    RATE_LIMIT_WRITE_MAX: '1000',
    RATE_LIMIT_READ_MAX: '1000',
    RATE_LIMIT_PUBLIC_MAX: '1000',
  };
}

/** Creates a user with one API key, directly in the database. */
export async function seedUser(app: NestFastifyApplication): Promise<{
  userId: string;
  key: string;
}> {
  const prisma = app.get(PrismaService);
  const generated = generateApiKey();
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@test.invalid`,
      apiKeys: { create: { name: 'test', prefix: generated.prefix, keyHash: generated.keyHash } },
    },
    select: { id: true },
  });
  return { userId: user.id, key: generated.key };
}

export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x21),
]);

/** Base64 sha-256, the form the storage port wants for its integrity check. */
export function checksumFor(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('base64');
}

export const GIF_BYTES = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(32, 0x42)]);

/** Builds a multipart body without pulling in a form-data dependency. */
export function multipartBody(
  field: string,
  filename: string,
  bytes: Buffer,
  contentType = 'application/octet-stream',
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----sharenote${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    payload: Buffer.concat([head, bytes, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
