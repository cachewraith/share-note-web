import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ShareRecord {
  readonly id: string;
  /** Null on shares created before edit tokens existed: readable, not writable. */
  readonly editTokenHash: string | null;
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
    editTokenHash: string;
    title: string;
    markdown: string;
    contentHash: string;
  }): Promise<ShareRecord> {
    return this.prisma.share.create({
      data: input,
      select: selectShare,
    });
  }

  async findForWrite(id: string, now: Date): Promise<ShareRecord | null> {
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

  /** Replaces a share's edit token. Used by `cli issue-token`. */
  async setEditTokenHash(id: string, editTokenHash: string): Promise<ShareRecord | null> {
    const share = await this.prisma.share.findUnique({ where: { id }, select: { id: true } });
    if (!share) return null;
    return this.prisma.share.update({
      where: { id },
      data: { editTokenHash },
      select: selectShare,
    });
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
  editTokenHash: true,
  title: true,
  contentHash: true,
  createdAt: true,
  updatedAt: true,
} as const;
