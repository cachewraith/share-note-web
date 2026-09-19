import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateApiKey } from '../../common/ids';
import { type ApiKeyRecord, type AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

function recordFor(
  generated: ReturnType<typeof generateApiKey>,
  overrides: Partial<ApiKeyRecord> = {},
): ApiKeyRecord {
  return {
    id: 'key-id',
    name: 'obsidian',
    prefix: generated.prefix,
    keyHash: generated.keyHash,
    revokedAt: null,
    lastUsedAt: null,
    user: { id: 'user-id', email: 'a@example.com', createdAt: new Date('2026-01-01') },
    ...overrides,
  };
}

describe('AuthService.authenticate', () => {
  const repository = {
    findKeyByPrefix: vi.fn<AuthRepository['findKeyByPrefix']>(),
    touchKey: vi.fn<AuthRepository['touchKey']>(),
  };
  const service = new AuthService(repository as unknown as AuthRepository);

  beforeEach(() => {
    vi.clearAllMocks();
    repository.touchKey.mockResolvedValue();
  });

  it('resolves a valid key to its principal', async () => {
    const generated = generateApiKey();
    repository.findKeyByPrefix.mockResolvedValue(recordFor(generated));

    const principal = await service.authenticate(generated.key);

    expect(principal).toMatchObject({
      userId: 'user-id',
      email: 'a@example.com',
      apiKeyId: 'key-id',
      apiKeyPrefix: generated.prefix,
    });
  });

  it('looks the key up by prefix only, never by the secret', async () => {
    const generated = generateApiKey();
    repository.findKeyByPrefix.mockResolvedValue(recordFor(generated));

    await service.authenticate(generated.key);

    expect(repository.findKeyByPrefix).toHaveBeenCalledWith(generated.prefix);
    expect(repository.findKeyByPrefix).not.toHaveBeenCalledWith(
      expect.stringContaining(generated.key),
    );
  });

  it('rejects a key whose secret does not match the stored digest', async () => {
    const stored = generateApiKey();
    const presented = `snw_${stored.prefix}_${generateApiKey().key.split('_')[2]!}`;
    repository.findKeyByPrefix.mockResolvedValue(recordFor(stored));

    expect(await service.authenticate(presented)).toBeNull();
  });

  it('rejects a revoked key even when the secret is right', async () => {
    const generated = generateApiKey();
    repository.findKeyByPrefix.mockResolvedValue(
      recordFor(generated, { revokedAt: new Date('2026-01-02') }),
    );

    expect(await service.authenticate(generated.key)).toBeNull();
  });

  it('rejects an unknown prefix', async () => {
    repository.findKeyByPrefix.mockResolvedValue(null);
    expect(await service.authenticate(generateApiKey().key)).toBeNull();
  });

  it('still compares a digest when no row is found, so timing does not leak', async () => {
    repository.findKeyByPrefix.mockResolvedValue(null);
    await service.authenticate(generateApiKey().key);
    // The decoy comparison happens inside authenticate; what we can assert is
    // that a miss does not short-circuit before the lookup.
    expect(repository.findKeyByPrefix).toHaveBeenCalledOnce();
  });

  it.each([
    ['empty', ''],
    ['not a key', 'hunter2'],
    ['wrong scheme', 'ghp_0123456789'],
  ])('rejects a malformed key (%s) without touching the database', async (_label, presented) => {
    expect(await service.authenticate(presented)).toBeNull();
    expect(repository.findKeyByPrefix).not.toHaveBeenCalled();
  });

  it('records last use when it is stale', async () => {
    const generated = generateApiKey();
    repository.findKeyByPrefix.mockResolvedValue(
      recordFor(generated, { lastUsedAt: new Date(Date.now() - 600_000) }),
    );

    await service.authenticate(generated.key);

    expect(repository.touchKey).toHaveBeenCalledWith('key-id', expect.any(Date));
  });

  it('does not record last use again within the resolution window', async () => {
    const generated = generateApiKey();
    repository.findKeyByPrefix.mockResolvedValue(
      recordFor(generated, { lastUsedAt: new Date(Date.now() - 1_000) }),
    );

    await service.authenticate(generated.key);

    expect(repository.touchKey).not.toHaveBeenCalled();
  });

  it('authenticates even when recording last use fails', async () => {
    const generated = generateApiKey();
    repository.findKeyByPrefix.mockResolvedValue(recordFor(generated));
    repository.touchKey.mockRejectedValue(new Error('database is read only'));

    expect(await service.authenticate(generated.key)).not.toBeNull();
  });
});
