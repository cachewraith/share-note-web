import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreateAssetResponse,
  extensionForMimeType,
  isAllowedImageMimeType,
  type PublicAsset,
} from '@share-note/contracts';
import { AppError } from '../../common/app-error';
import { sha256Hex } from '../../common/hash';
import { generatePublicId } from '../../common/ids';
import { sniffImageMimeType } from '../../common/mime';
import { UrlBuilder } from '../../common/url.builder';
import { APP_CONFIG, type AppConfig } from '../../config';
import { STORAGE_PORT, type StoragePort } from '../../infra/storage';
import { type Principal } from '../auth/principal';
import { ShareRepository } from '../shares/share.repository';
import { AssetRepository, type AssetRecord } from './asset.repository';
import { validateFilename } from './filename';
import { type UploadedAsset } from './uploaded-asset.decorator';

export interface ServableAsset {
  readonly record: AssetRecord;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly assets: AssetRepository,
    private readonly shares: ShareRepository,
    private readonly urls: UrlBuilder,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Attaches an image to a share the caller owns.
   *
   * Re-uploading the same bytes under the same name is a no-op, which is what
   * lets the plugin skip work when a note's attachments have not changed.
   * Uploading *different* bytes under the same name mints a new id rather than
   * overwriting: ids are served with a one-year immutable cache, so they must
   * never change meaning.
   */
  async upload(
    principal: Principal,
    shareId: string,
    upload: UploadedAsset,
  ): Promise<CreateAssetResponse> {
    await this.assertOwnsShare(principal, shareId);

    const filename = validateFilename(upload.filename);
    if (!filename) {
      throw AppError.validation('Attachment filename is empty, too long, or contains a path');
    }

    if (upload.bytes.byteLength === 0) {
      throw AppError.validation('Attachment is empty');
    }
    if (upload.bytes.byteLength > this.config.limits.assetMaxBytes) {
      throw AppError.payloadTooLarge(
        `Attachment is ${String(upload.bytes.byteLength)} bytes; this server accepts at most ${String(
          this.config.limits.assetMaxBytes,
        )}`,
      );
    }

    // The declared content type and the extension are both attacker-controlled;
    // only the magic bytes decide (OWASP A08).
    const mime = sniffImageMimeType(upload.bytes);
    if (!mime) {
      throw AppError.unsupportedMediaType(
        'Attachment is not a PNG, JPEG, GIF or WebP image. SVG is not accepted.',
      );
    }

    const sha256 = sha256Hex(upload.bytes);
    const existing = await this.assets.findByShareAndFilename(shareId, filename);

    if (existing?.sha256 === sha256 && existing?.mime === mime) {
      return { ...this.toPublicAsset(existing, mime), created: false };
    }

    if (!existing) {
      const count = await this.assets.countByShare(shareId);
      if (count >= this.config.limits.assetsPerShareMax) {
        throw AppError.assetLimitReached(
          `This share already has ${String(count)} attachments, the maximum is ${String(
            this.config.limits.assetsPerShareMax,
          )}`,
        );
      }
    }

    const id = generatePublicId();
    const next: AssetRecord = {
      id,
      shareId,
      filename,
      // Derived from ids we generated, never from the filename, so a crafted
      // name cannot reach another share's objects (OWASP A01).
      storageKey: `shares/${shareId}/${id}.${extensionForMimeType(mime)}`,
      mime,
      size: upload.bytes.byteLength,
      sha256,
    };

    // Storage first: a row that points at a missing object would serve a broken
    // image, whereas an object with no row is merely garbage the sweep collects.
    await this.storage.put({
      key: next.storageKey,
      body: upload.bytes,
      contentType: mime,
      checksumSha256: Buffer.from(sha256, 'hex').toString('base64'),
    });

    const stored = existing
      ? await this.assets.replace(existing.id, next)
      : await this.assets.create(next);

    if (existing) {
      await this.storage.delete([existing.storageKey]).catch((error: unknown) => {
        this.logger.warn(`replaced asset ${existing.id}, old object remains: ${String(error)}`);
      });
    }

    return { ...this.toPublicAsset(stored, mime), created: true };
  }

  /** Unauthenticated. Resolves an asset id to something the controller can stream. */
  async findServable(id: string): Promise<AssetRecord> {
    const asset = await this.assets.findById(id);
    if (!asset) throw AppError.notFound('No such attachment');
    return asset;
  }

  async open(key: string): Promise<NodeJS.ReadableStream> {
    const object = await this.storage.get(key);
    if (!object) throw AppError.notFound('No such attachment');
    return object.stream;
  }

  private async assertOwnsShare(principal: Principal, shareId: string): Promise<void> {
    const share = await this.shares.findOwned(shareId, new Date());
    // A share that does not exist and one owned by somebody else are the same
    // answer on purpose (see SharesService.findOwnedOrThrow).
    if (share?.ownerId !== principal.userId) {
      throw AppError.notFound('No such share');
    }
  }

  private toPublicAsset(record: AssetRecord, mime: string): PublicAsset {
    if (!isAllowedImageMimeType(mime)) {
      throw AppError.internal('Stored attachment has an unexpected type');
    }
    return {
      id: record.id,
      url: this.urls.asset(record.id),
      filename: record.filename,
      mime,
      size: record.size,
      sha256: record.sha256,
    };
  }
}
