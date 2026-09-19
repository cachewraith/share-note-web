import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AllowedImageMimeType,
  type CreateShareRequest,
  type CreateShareResponse,
  type ListSharesQuery,
  type ListSharesResponse,
  type PublicShareResponse,
  type UpdateShareResponse,
  isAllowedImageMimeType,
  utf8ByteLength,
} from '@share-note/contracts';
import { AppError } from '../../common/app-error';
import { sha256Hex } from '../../common/hash';
import { generatePublicId } from '../../common/ids';
import { isPrismaError, PRISMA_UNIQUE_VIOLATION } from '../../common/prisma-errors';
import { UrlBuilder } from '../../common/url.builder';
import { APP_CONFIG, type AppConfig } from '../../config';
import { STORAGE_PORT, type StoragePort } from '../../infra/storage';
import { type Principal } from '../auth/principal';
import { ShareRepository, type ShareRecord } from './share.repository';

/** Astronomically unlikely with 126 bits of entropy, but cheap to survive. */
const ID_COLLISION_RETRIES = 3;

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  constructor(
    private readonly repository: ShareRepository,
    private readonly urls: UrlBuilder,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(principal: Principal, input: CreateShareRequest): Promise<CreateShareResponse> {
    this.assertWithinMarkdownLimit(input.markdown);
    const contentHash = sha256Hex(input.markdown);

    for (let attempt = 0; attempt < ID_COLLISION_RETRIES; attempt += 1) {
      try {
        const share = await this.repository.create({
          id: generatePublicId(),
          ownerId: principal.userId,
          title: input.title,
          markdown: input.markdown,
          contentHash,
        });
        return { id: share.id, url: this.urls.share(share.id), contentHash };
      } catch (error) {
        if (!isPrismaError(error, PRISMA_UNIQUE_VIOLATION)) throw error;
        this.logger.warn('public id collision, retrying');
      }
    }

    throw AppError.internal('Could not allocate a share id');
  }

  async update(
    principal: Principal,
    id: string,
    input: CreateShareRequest,
  ): Promise<UpdateShareResponse> {
    this.assertWithinMarkdownLimit(input.markdown);
    const existing = await this.findOwnedOrThrow(principal, id);
    const contentHash = sha256Hex(input.markdown);

    if (existing.contentHash === contentHash && existing.title === input.title) {
      return { id, url: this.urls.share(id), contentHash, updated: false };
    }

    await this.repository.update(id, {
      title: input.title,
      markdown: input.markdown,
      contentHash,
    });
    return { id, url: this.urls.share(id), contentHash, updated: true };
  }

  /**
   * Hard delete (see docs/decisions/0008). The row goes first so that a storage
   * failure cannot resurrect a share the user asked to remove; the objects it
   * leaves behind are unreachable and get swept by `cli prune-assets`.
   */
  async remove(principal: Principal, id: string): Promise<void> {
    await this.findOwnedOrThrow(principal, id);
    const storageKeys = await this.repository.deleteReturningStorageKeys(id);

    if (storageKeys.length === 0) return;
    try {
      await this.storage.delete(storageKeys);
    } catch (error) {
      this.logger.error(
        `share ${id} deleted but ${String(storageKeys.length)} object(s) remain: ${String(error)}`,
      );
    }
  }

  async list(principal: Principal, query: ListSharesQuery): Promise<ListSharesResponse> {
    const rows = await this.repository.listByOwner({
      ownerId: principal.userId,
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      now: new Date(),
    });

    return {
      shares: rows.map((row) => ({
        id: row.id,
        url: this.urls.share(row.id),
        title: row.title,
        contentHash: row.contentHash,
        assetCount: row.assetCount,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor: rows.length === query.limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }

  /** Unauthenticated. Returns nothing that identifies the owner. */
  async getPublic(id: string): Promise<PublicShareResponse> {
    const share = await this.repository.findPublic(id, new Date());
    if (!share) throw AppError.notFound('No such share');

    return {
      id: share.id,
      title: share.title,
      markdown: share.markdown,
      contentHash: share.contentHash,
      createdAt: share.createdAt.toISOString(),
      updatedAt: share.updatedAt.toISOString(),
      assets: share.assets.flatMap((asset) => {
        if (!isAllowedImageMimeType(asset.mime)) {
          // Only allowed types are ever written, so this means the row was
          // tampered with or predates a narrowing of the allowlist.
          this.logger.warn(`asset ${asset.id} has unexpected mime, omitting it`);
          return [];
        }
        const mime: AllowedImageMimeType = asset.mime;
        return [
          {
            id: asset.id,
            url: this.urls.asset(asset.id),
            filename: asset.filename,
            mime,
            size: asset.size,
            sha256: asset.sha256,
          },
        ];
      }),
    };
  }

  /**
   * Owner check and existence check in one. A share owned by somebody else
   * answers NOT_FOUND, not FORBIDDEN: telling a caller that an id exists but is
   * not theirs leaks which links are live (OWASP A01).
   */
  private async findOwnedOrThrow(principal: Principal, id: string): Promise<ShareRecord> {
    const share = await this.repository.findOwned(id, new Date());
    if (share?.ownerId !== principal.userId) {
      throw AppError.notFound('No such share');
    }
    return share;
  }

  private assertWithinMarkdownLimit(markdown: string): void {
    const bytes = utf8ByteLength(markdown);
    if (bytes > this.config.limits.markdownMaxBytes) {
      throw AppError.payloadTooLarge(
        `Markdown is ${String(bytes)} bytes; this server accepts at most ${String(
          this.config.limits.markdownMaxBytes,
        )}`,
      );
    }
  }
}
