import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface AssetRecord {
  readonly id: string;
  readonly shareId: string;
  readonly filename: string;
  readonly storageKey: string;
  readonly mime: string;
  readonly size: number;
  readonly sha256: string;
}

const selectAsset = {
  id: true,
  shareId: true,
  filename: true,
  storageKey: true,
  mime: true,
  size: true,
  sha256: true,
} as const;

@Injectable()
export class AssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countByShare(shareId: string): Promise<number> {
    return this.prisma.asset.count({ where: { shareId } });
  }

  async findByShareAndFilename(shareId: string, filename: string): Promise<AssetRecord | null> {
    return this.prisma.asset.findUnique({
      where: { shareId_filename: { shareId, filename } },
      select: selectAsset,
    });
  }

  async findById(id: string): Promise<AssetRecord | null> {
    return this.prisma.asset.findUnique({ where: { id }, select: selectAsset });
  }

  async create(input: AssetRecord): Promise<AssetRecord> {
    return this.prisma.asset.create({ data: input, select: selectAsset });
  }

  /**
   * Swaps one attachment for another under the same filename in a single
   * transaction, so a share never shows two attachments with the same name.
   */
  async replace(previousId: string, next: AssetRecord): Promise<AssetRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.asset.delete({ where: { id: previousId } });
      return tx.asset.create({ data: next, select: selectAsset });
    });
  }

  /** Every storage key the database knows about, for the orphan sweep. */
  async allStorageKeys(): Promise<Set<string>> {
    const rows = await this.prisma.asset.findMany({ select: { storageKey: true } });
    return new Set(rows.map((row) => row.storageKey));
  }
}
