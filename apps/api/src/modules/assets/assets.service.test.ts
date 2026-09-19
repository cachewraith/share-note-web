import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../common/hash';
import { UrlBuilder } from '../../common/url.builder';
import { testConfig } from '../../../test/fixtures';
import { type Principal } from '../auth/principal';
import { type ShareRepository } from '../shares/share.repository';
import { type AssetRecord, type AssetRepository } from './asset.repository';
import { AssetsService } from './assets.service';

const owner: Principal = {
  userId: 'owner-1',
  email: null,
  userCreatedAt: new Date('2026-01-01'),
  apiKeyId: 'key-1',
  apiKeyName: 'obsidian',
  apiKeyPrefix: 'abcd1234',
};

const SHARE_ID = 'aaaaaaaaaaaaaaaaaaaaa';

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 7),
]);
const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(16, 3)]);

function existingAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'bbbbbbbbbbbbbbbbbbbbb',
    shareId: SHARE_ID,
    filename: 'a.png',
    storageKey: `shares/${SHARE_ID}/bbbbbbbbbbbbbbbbbbbbb.png`,
    mime: 'image/png',
    size: png.byteLength,
    sha256: sha256Hex(png),
    ...overrides,
  };
}

describe('AssetsService.upload', () => {
  const assets = {
    countByShare: vi.fn(),
    findByShareAndFilename: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    replace: vi.fn(),
    allStorageKeys: vi.fn(),
  };
  const shares = { findOwned: vi.fn() };
  const storage = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    isReachable: vi.fn(),
  };
  const config = testConfig();
  const service = new AssetsService(
    assets as unknown as AssetRepository,
    shares as unknown as ShareRepository,
    new UrlBuilder(config),
    storage,
    config,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    shares.findOwned.mockResolvedValue({ id: SHARE_ID, ownerId: owner.userId });
    assets.findByShareAndFilename.mockResolvedValue(null);
    assets.countByShare.mockResolvedValue(0);
    assets.create.mockImplementation((record: AssetRecord) => Promise.resolve(record));
    assets.replace.mockImplementation((_id: string, record: AssetRecord) =>
      Promise.resolve(record),
    );
    storage.put.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);
  });

  it('rejects a filename containing a path', async () => {
    await expect(
      service.upload(owner, SHARE_ID, { filename: '../../etc/passwd', bytes: png }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('stores an image under a key built only from the share and asset ids', async () => {
    const result = await service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: png });

    expect(result.created).toBe(true);
    expect(result.mime).toBe('image/png');
    const put = storage.put.mock.calls[0]?.[0] as { key: string };
    expect(put.key).toMatch(new RegExp(`^shares/${SHARE_ID}/[A-Za-z0-9_-]{21}\\.png$`));
  });

  it('writes the object before the row', async () => {
    const order: string[] = [];
    storage.put.mockImplementation(() => {
      order.push('storage');
      return Promise.resolve();
    });
    assets.create.mockImplementation((record: AssetRecord) => {
      order.push('database');
      return Promise.resolve(record);
    });

    await service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: png });

    expect(order).toEqual(['storage', 'database']);
  });

  it('ignores the declared type and trusts the magic bytes', async () => {
    const result = await service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: gif });
    expect(result.mime).toBe('image/gif');
  });

  it('refuses an svg disguised as a png', async () => {
    await expect(
      service.upload(owner, SHARE_ID, {
        filename: 'logo.png',
        bytes: Buffer.from('<svg onload="alert(1)"/>'),
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('refuses an empty file', async () => {
    await expect(
      service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: Buffer.alloc(0) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('refuses a file over the configured size', async () => {
    const small = testConfig({ ASSET_MAX_BYTES: '16' });
    const limited = new AssetsService(
      assets as unknown as AssetRepository,
      shares as unknown as ShareRepository,
      new UrlBuilder(small),
      storage,
      small,
    );

    await expect(
      limited.upload(owner, SHARE_ID, { filename: 'a.png', bytes: png }),
    ).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('is a no-op when the same bytes are uploaded under the same name', async () => {
    assets.findByShareAndFilename.mockResolvedValue(existingAsset());

    const result = await service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: png });

    expect(result.created).toBe(false);
    expect(result.id).toBe('bbbbbbbbbbbbbbbbbbbbb');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('mints a new id when the same name gets different bytes', async () => {
    assets.findByShareAndFilename.mockResolvedValue(existingAsset());

    const result = await service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: gif });

    expect(result.id).not.toBe('bbbbbbbbbbbbbbbbbbbbb');
    expect(assets.replace).toHaveBeenCalledWith('bbbbbbbbbbbbbbbbbbbbb', expect.anything());
    expect(storage.delete).toHaveBeenCalledWith([existingAsset().storageKey]);
  });

  it('enforces the per-share attachment limit for new names only', async () => {
    assets.countByShare.mockResolvedValue(50);

    await expect(
      service.upload(owner, SHARE_ID, { filename: 'new.png', bytes: png }),
    ).rejects.toMatchObject({ code: 'ASSET_LIMIT_REACHED' });

    assets.findByShareAndFilename.mockResolvedValue(existingAsset());
    await expect(
      service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: gif }),
    ).resolves.toBeDefined();
  });

  it("refuses to attach to another owner's share", async () => {
    shares.findOwned.mockResolvedValue({ id: SHARE_ID, ownerId: 'somebody-else' });

    await expect(
      service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: png }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('sends a checksum the store can verify', async () => {
    await service.upload(owner, SHARE_ID, { filename: 'a.png', bytes: png });

    const put = storage.put.mock.calls[0]?.[0] as { checksumSha256: string };
    expect(put.checksumSha256).toBe(Buffer.from(sha256Hex(png), 'hex').toString('base64'));
  });
});
