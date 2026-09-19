import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { S3Storage } from '../src/infra/storage/s3.storage';
import { checksumFor, integrationEnv, PNG_BYTES } from './harness';

/** Exercises the adapter directly, against the MinIO in docker-compose.yml. */
let storage: S3Storage;
const prefix = `shares/storage-test-${randomUUID()}`;

beforeAll(() => {
  Object.assign(process.env, integrationEnv());
  storage = new S3Storage(loadConfig(process.env));
});

afterAll(async () => {
  const objects = await storage.list(prefix);
  await storage.delete(objects.map((object) => object.key));
});

describe('S3Storage', () => {
  it('round-trips an object with its content type', async () => {
    const key = `${prefix}/round-trip.png`;
    await storage.put({
      key,
      body: PNG_BYTES,
      contentType: 'image/png',
      checksumSha256: checksumFor(PNG_BYTES),
    });

    const object = await storage.get(key);
    expect(object).not.toBeNull();
    expect(object?.contentType).toBe('image/png');
    expect(object?.contentLength).toBe(PNG_BYTES.byteLength);

    const chunks: Buffer[] = [];
    for await (const chunk of object!.stream) chunks.push(Buffer.from(chunk as Buffer));
    expect(Buffer.concat(chunks).equals(PNG_BYTES)).toBe(true);
  });

  it('refuses a body that does not match its checksum', async () => {
    await expect(
      storage.put({
        key: `${prefix}/tampered.png`,
        body: PNG_BYTES,
        contentType: 'image/png',
        checksumSha256: checksumFor(Buffer.from('different bytes')),
      }),
    ).rejects.toThrow();

    expect(await storage.get(`${prefix}/tampered.png`)).toBeNull();
  });

  it('answers null for a missing key rather than throwing', async () => {
    expect(await storage.get(`${prefix}/never-written.png`)).toBeNull();
  });

  it('lists objects under a prefix with their size and age', async () => {
    const key = `${prefix}/listed.png`;
    await storage.put({
      key,
      body: PNG_BYTES,
      contentType: 'image/png',
      checksumSha256: checksumFor(PNG_BYTES),
    });

    const objects = await storage.list(prefix);
    const listed = objects.find((object) => object.key === key);

    expect(listed?.size).toBe(PNG_BYTES.byteLength);
    expect(listed?.lastModified.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('deleting is idempotent', async () => {
    const key = `${prefix}/twice.png`;
    await storage.put({
      key,
      body: PNG_BYTES,
      contentType: 'image/png',
      checksumSha256: checksumFor(PNG_BYTES),
    });

    await storage.delete([key]);
    await expect(storage.delete([key])).resolves.toBeUndefined();
    expect(await storage.get(key)).toBeNull();
  });

  it('deleting nothing is a no-op', async () => {
    await expect(storage.delete([])).resolves.toBeUndefined();
  });

  it('reports the bucket as reachable', async () => {
    expect(await storage.isReachable()).toBe(true);
  });
});
