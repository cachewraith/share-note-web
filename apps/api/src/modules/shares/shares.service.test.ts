import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/app-error';
import { sha256Hex } from '../../common/hash';
import { UrlBuilder } from '../../common/url.builder';
import { testConfig } from '../../../test/fixtures';
import { type Principal } from '../auth/principal';
import { type ShareRepository } from './share.repository';
import { SharesService } from './shares.service';

const owner: Principal = {
  userId: 'owner-1',
  email: null,
  userCreatedAt: new Date('2026-01-01'),
  apiKeyId: 'key-1',
  apiKeyName: 'obsidian',
  apiKeyPrefix: 'abcd1234',
};

const intruder: Principal = { ...owner, userId: 'owner-2' };

function shareRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaaaaaaaaaaaaaaa',
    ownerId: owner.userId,
    title: 'Note',
    contentHash: sha256Hex('# Note'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('SharesService', () => {
  const repository = {
    create: vi.fn(),
    findOwned: vi.fn(),
    findPublic: vi.fn(),
    update: vi.fn(),
    listByOwner: vi.fn(),
    deleteReturningStorageKeys: vi.fn(),
  };
  const storage = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    isReachable: vi.fn(),
  };
  const config = testConfig();
  const service = new SharesService(
    repository as unknown as ShareRepository,
    new UrlBuilder(config),
    storage,
    config,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    storage.delete.mockResolvedValue(undefined);
  });

  describe('create', () => {
    it('stores the note and returns a link built from the configured web url', async () => {
      repository.create.mockImplementation((input: { id: string }) =>
        Promise.resolve(shareRecord({ id: input.id })),
      );

      const result = await service.create(owner, { title: 'Note', markdown: '# Note' });

      expect(result.url).toBe(`https://notes.example.com/${result.id}`);
      expect(result.contentHash).toBe(sha256Hex('# Note'));
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'owner-1', markdown: '# Note' }),
      );
    });

    it('retries once on an id collision and then succeeds', async () => {
      repository.create
        .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
        .mockImplementation((input: { id: string }) =>
          Promise.resolve(shareRecord({ id: input.id })),
        );

      await expect(service.create(owner, { title: 'Note', markdown: '# Note' })).resolves.toEqual(
        expect.objectContaining({ contentHash: sha256Hex('# Note') }),
      );
      expect(repository.create).toHaveBeenCalledTimes(2);
    });

    it('propagates a database error that is not a collision', async () => {
      repository.create.mockRejectedValue(new Error('connection refused'));
      await expect(service.create(owner, { title: 'Note', markdown: 'x' })).rejects.toThrow(
        'connection refused',
      );
    });

    it('refuses markdown over this server configured limit', async () => {
      const small = new SharesService(
        repository as unknown as ShareRepository,
        new UrlBuilder(testConfig({ MARKDOWN_MAX_BYTES: '16' })),
        storage,
        testConfig({ MARKDOWN_MAX_BYTES: '16' }),
      );

      await expect(
        small.create(owner, { title: 'Note', markdown: 'x'.repeat(17) }),
      ).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('reports updated:false and writes nothing when the content is unchanged', async () => {
      repository.findOwned.mockResolvedValue(shareRecord());

      const result = await service.update(owner, 'aaaaaaaaaaaaaaaaaaaaa', {
        title: 'Note',
        markdown: '# Note',
      });

      expect(result.updated).toBe(false);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('writes when only the title changed', async () => {
      repository.findOwned.mockResolvedValue(shareRecord());
      repository.update.mockResolvedValue(shareRecord({ title: 'Renamed' }));

      const result = await service.update(owner, 'aaaaaaaaaaaaaaaaaaaaa', {
        title: 'Renamed',
        markdown: '# Note',
      });

      expect(result.updated).toBe(true);
      expect(repository.update).toHaveBeenCalledOnce();
    });

    it('keeps the same id and url across an update', async () => {
      repository.findOwned.mockResolvedValue(shareRecord());
      repository.update.mockResolvedValue(shareRecord());

      const result = await service.update(owner, 'aaaaaaaaaaaaaaaaaaaaa', {
        title: 'Note',
        markdown: '# Changed',
      });

      expect(result.id).toBe('aaaaaaaaaaaaaaaaaaaaa');
      expect(result.url).toBe('https://notes.example.com/aaaaaaaaaaaaaaaaaaaaa');
    });

    it("answers NOT_FOUND for another owner's share", async () => {
      repository.findOwned.mockResolvedValue(shareRecord());

      await expect(
        service.update(intruder, 'aaaaaaaaaaaaaaaaaaaaa', { title: 'x', markdown: 'y' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the row and then the objects', async () => {
      repository.findOwned.mockResolvedValue(shareRecord());
      repository.deleteReturningStorageKeys.mockResolvedValue(['shares/a/b.png']);

      await service.remove(owner, 'aaaaaaaaaaaaaaaaaaaaa');

      expect(repository.deleteReturningStorageKeys).toHaveBeenCalledWith('aaaaaaaaaaaaaaaaaaaaa');
      expect(storage.delete).toHaveBeenCalledWith(['shares/a/b.png']);
    });

    it('does not call storage when the share had no attachments', async () => {
      repository.findOwned.mockResolvedValue(shareRecord());
      repository.deleteReturningStorageKeys.mockResolvedValue([]);

      await service.remove(owner, 'aaaaaaaaaaaaaaaaaaaaa');

      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('stays deleted when the bucket call fails', async () => {
      repository.findOwned.mockResolvedValue(shareRecord());
      repository.deleteReturningStorageKeys.mockResolvedValue(['shares/a/b.png']);
      storage.delete.mockRejectedValue(new Error('bucket unreachable'));

      await expect(service.remove(owner, 'aaaaaaaaaaaaaaaaaaaaa')).resolves.toBeUndefined();
    });

    it("refuses to delete another owner's share", async () => {
      repository.findOwned.mockResolvedValue(shareRecord());

      await expect(service.remove(intruder, 'aaaaaaaaaaaaaaaaaaaaa')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(repository.deleteReturningStorageKeys).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns a cursor only when the page is full', async () => {
      repository.listByOwner.mockResolvedValue([{ ...shareRecord(), assetCount: 0 }]);

      expect((await service.list(owner, { limit: 1 })).nextCursor).toBe('aaaaaaaaaaaaaaaaaaaaa');
      expect((await service.list(owner, { limit: 50 })).nextCursor).toBeNull();
    });

    it('scopes the query to the caller', async () => {
      repository.listByOwner.mockResolvedValue([]);
      await service.list(owner, { limit: 50 });
      expect(repository.listByOwner).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'owner-1' }),
      );
    });
  });

  describe('getPublic', () => {
    it('returns the note with absolute asset urls and no owner field', async () => {
      repository.findPublic.mockResolvedValue({
        ...shareRecord(),
        markdown: '# Note',
        assets: [
          {
            id: 'bbbbbbbbbbbbbbbbbbbbb',
            filename: 'a.png',
            mime: 'image/png',
            size: 10,
            sha256: 'f'.repeat(64),
          },
        ],
      });

      const result = await service.getPublic('aaaaaaaaaaaaaaaaaaaaa');

      expect(result).not.toHaveProperty('ownerId');
      expect(result.assets[0]?.url).toBe(
        'https://api.example.com/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb',
      );
    });

    it('omits an attachment whose stored type is no longer allowed', async () => {
      repository.findPublic.mockResolvedValue({
        ...shareRecord(),
        markdown: '# Note',
        assets: [
          {
            id: 'bbbbbbbbbbbbbbbbbbbbb',
            filename: 'a.svg',
            mime: 'image/svg+xml',
            size: 10,
            sha256: 'f'.repeat(64),
          },
        ],
      });

      expect((await service.getPublic('aaaaaaaaaaaaaaaaaaaaa')).assets).toEqual([]);
    });

    it('answers NOT_FOUND for an unknown id', async () => {
      repository.findPublic.mockResolvedValue(null);
      await expect(service.getPublic('aaaaaaaaaaaaaaaaaaaaa')).rejects.toBeInstanceOf(AppError);
    });
  });
});
