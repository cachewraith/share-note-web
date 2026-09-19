import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ShareRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ShareWithMarkdown extends ShareRecord {
  readonly markdown: string;
}

export interface PublicShareRecord {
  readonly id: string;
  readonly title: string;
  readonly markdown: string;
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly assets: readonly {
    readonly id: string;
    readonly filename: string;
    readonly mime: string;
    readonly size: number;
    readonly sha256: string;
  }[];
}

export interface ShareListItem extends ShareRecord {
  readonly assetCount: number;
}

/**
 * Every query filters `deletedAt` and `expiresAt`, so the reserved columns in
 * the schema are honoured from day one and a later soft-delete or expiry
 * feature needs no change to a read path.
 */
function visible(now: Date) {
  return {
    deletedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

@Injectable()
export class ShareRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    id: string;
    ownerId: string;
    title: string;
    markdown: string;
    contentHash: string;
  }): Promise<ShareRecord> {
    return this.prisma.share.create({
      data: input,
      select: selectShare,
    });
  }

  async findOwned(id: string, now: Date): Promise<ShareRecord | null> {
    return this.prisma.share.findFirst({
      where: { id, ...visible(now) },
      select: selectShare,
    });
  }

  async findPublic(id: string, now: Date): Promise<PublicShareRecord | null> {
    return this.prisma.share.findFirst({
      where: { id, ...visible(now) },
      select: {
        id: true,
        title: true,
        markdown: true,
        contentHash: true,
        createdAt: true,
        updatedAt: true,
        assets: {
          select: { id: true, filename: true, mime: true, size: true, sha256: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async update(
    id: string,
    input: { title: string; markdown: string; contentHash: string },
  ): Promise<ShareRecord> {
    return this.prisma.share.update({ where: { id }, data: input, select: selectShare });
  }

  async listByOwner(input: {
    ownerId: string;
    limit: number;
    cursor?: string;
    now: Date;
  }): Promise<ShareListItem[]> {
    const rows = await this.prisma.share.findMany({
      where: { ownerId: input.ownerId, ...visible(input.now) },
      select: { ...selectShare, _count: { select: { assets: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    return rows.map(({ _count, ...share }) => ({ ...share, assetCount: _count.assets }));
  }

  /** Deletes the share and returns the storage keys its assets occupied. */
  async deleteReturningStorageKeys(id: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const assets = await tx.asset.findMany({
        where: { shareId: id },
        select: { storageKey: true },
      });
      await tx.share.delete({ where: { id } });
      return assets.map((asset) => asset.storageKey);
    });
  }
}

const selectShare = {
  id: true,
  ownerId: true,
  title: true,
  contentHash: true,
  createdAt: true,
  updatedAt: true,
} as const;
