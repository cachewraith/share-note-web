import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/app-error';
import { sha256Hex } from '../../common/hash';
import { UrlBuilder } from '../../common/url.builder';
import { testConfig } from '../../../test/fixtures';
import { EditTokenService } from './edit-token.service';
import { type ShareRepository } from './share.repository';
import { SharesService } from './shares.service';

const TOKEN = `snt_${'a'.repeat(43)}`;
const OTHER_TOKEN = `snt_${'b'.repeat(43)}`;

function shareRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaaaaaaaaaaaaaaa',
    editTokenHash: sha256Hex(TOKEN),
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
    findForWrite: vi.fn(),
    findPublic: vi.fn(),
    update: vi.fn(),
    setEditTokenHash: vi.fn(),
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
  const editTokens = new EditTokenService(repository as unknown as ShareRepository);
  const service = new SharesService(
    repository as unknown as ShareRepository,
    editTokens,
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

      const result = await service.create({ title: 'Note', markdown: '# Note' });

      expect(result.url).toBe(`https://notes.example.com/${result.id}`);
      expect(result.contentHash).toBe(sha256Hex('# Note'));
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ markdown: '# Note' }),
      );
    });

    it('returns an edit token and stores only its digest', async () => {
      repository.create.mockImplementation((input: { id: string }) =>
        Promise.resolve(shareRecord({ id: input.id })),
      );

      const result = await service.create({ title: 'Note', markdown: '# Note' });

      expect(result.editToken).toMatch(/^snt_[A-Za-z0-9_-]{43}$/);
      const stored = repository.create.mock.calls[0]?.[0] as { editTokenHash: string };
      expect(stored.editTokenHash).toBe(sha256Hex(result.editToken));
      expect(stored.editTokenHash).not.toContain(result.editToken.slice(4));
    });

    it('mints a different token for every share', async () => {
      repository.create.mockImplementation((input: { id: string }) =>
        Promise.resolve(shareRecord({ id: input.id })),
      );

      const first = await service.create({ title: 'Note', markdown: '# Note' });
      const second = await service.create({ title: 'Note', markdown: '# Note' });

      expect(first.editToken).not.toBe(second.editToken);
    });

    it('retries once on an id collision and then succeeds', async () => {
      repository.create
        .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
        .mockImplementation((input: { id: string }) =>
          Promise.resolve(shareRecord({ id: input.id })),
        );

      await expect(service.create({ title: 'Note', markdown: '# Note' })).resolves.toEqual(
        expect.objectContaining({ contentHash: sha256Hex('# Note') }),
      );
      expect(repository.create).toHaveBeenCalledTimes(2);
    });

    it('propagates a database error that is not a collision', async () => {
      repository.create.mockRejectedValue(new Error('connection refused'));
      await expect(service.create({ title: 'Note', markdown: 'x' })).rejects.toThrow(
        'connection refused',
      );
    });

    it('refuses markdown over this server configured limit', async () => {
      const small = new SharesService(
        repository as unknown as ShareRepository,
        editTokens,
        new UrlBuilder(testConfig({ MARKDOWN_MAX_BYTES: '16' })),
        storage,
        testConfig({ MARKDOWN_MAX_BYTES: '16' }),
      );

      await expect(small.create({ title: 'Note', markdown: 'x'.repeat(17) })).rejects.toMatchObject(
        { code: 'PAYLOAD_TOO_LARGE' },
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('reports updated:false and writes nothing when the content is unchanged', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());

      const result = await service.update('aaaaaaaaaaaaaaaaaaaaa', TOKEN, {
        title: 'Note',
        markdown: '# Note',
      });

      expect(result.updated).toBe(false);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('writes when only the title changed', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());
      repository.update.mockResolvedValue(shareRecord({ title: 'Renamed' }));

      const result = await service.update('aaaaaaaaaaaaaaaaaaaaa', TOKEN, {
        title: 'Renamed',
        markdown: '# Note',
      });

      expect(result.updated).toBe(true);
      expect(repository.update).toHaveBeenCalledOnce();
    });

    it('keeps the same id and url across an update', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());
      repository.update.mockResolvedValue(shareRecord());

      const result = await service.update('aaaaaaaaaaaaaaaaaaaaa', TOKEN, {
        title: 'Note',
        markdown: '# Changed',
      });

      expect(result.id).toBe('aaaaaaaaaaaaaaaaaaaaa');
      expect(result.url).toBe('https://notes.example.com/aaaaaaaaaaaaaaaaaaaaa');
    });

    it('answers NOT_FOUND when the edit token does not match', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());

      await expect(
        service.update('aaaaaaaaaaaaaaaaaaaaa', OTHER_TOKEN, { title: 'x', markdown: 'y' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND when no token is presented at all', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());

      await expect(
        service.update('aaaaaaaaaaaaaaaaaaaaa', undefined, { title: 'x', markdown: 'y' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND for a share that predates edit tokens', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord({ editTokenHash: null }));

      await expect(
        service.update('aaaaaaaaaaaaaaaaaaaaa', TOKEN, { title: 'x', markdown: 'y' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the row and then the objects', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());
      repository.deleteReturningStorageKeys.mockResolvedValue(['shares/a/b.png']);

      await service.remove('aaaaaaaaaaaaaaaaaaaaa', TOKEN);

      expect(repository.deleteReturningStorageKeys).toHaveBeenCalledWith('aaaaaaaaaaaaaaaaaaaaa');
      expect(storage.delete).toHaveBeenCalledWith(['shares/a/b.png']);
    });

    it('does not call storage when the share had no attachments', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());
      repository.deleteReturningStorageKeys.mockResolvedValue([]);

      await service.remove('aaaaaaaaaaaaaaaaaaaaa', TOKEN);

      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('stays deleted when the bucket call fails', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());
      repository.deleteReturningStorageKeys.mockResolvedValue(['shares/a/b.png']);
      storage.delete.mockRejectedValue(new Error('bucket unreachable'));

      await expect(service.remove('aaaaaaaaaaaaaaaaaaaaa', TOKEN)).resolves.toBeUndefined();
    });

    it('refuses to delete a share whose token the caller does not hold', async () => {
      repository.findForWrite.mockResolvedValue(shareRecord());

      await expect(service.remove('aaaaaaaaaaaaaaaaaaaaa', OTHER_TOKEN)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(repository.deleteReturningStorageKeys).not.toHaveBeenCalled();
    });
  });

  describe('getPublic', () => {
    it('returns the note with absolute asset urls and no token of any kind', async () => {
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
