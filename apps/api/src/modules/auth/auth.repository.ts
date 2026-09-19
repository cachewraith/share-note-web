import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ApiKeyRecord {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly keyHash: string;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly user: { readonly id: string; readonly email: string | null; readonly createdAt: Date };
}

/**
 * All database access for users and API keys. Keeping it behind a repository
 * means the service never holds a Prisma type, and swapping the store is a
 * change to this file alone.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    return this.prisma.apiKey.findUnique({
      where: { prefix },
      select: {
        id: true,
        name: true,
        prefix: true,
        keyHash: true,
        revokedAt: true,
        lastUsedAt: true,
        user: { select: { id: true, email: true, createdAt: true } },
      },
    });
  }

  async touchKey(id: string, at: Date): Promise<void> {
    await this.prisma.apiKey.update({ where: { id }, data: { lastUsedAt: at } });
  }

  async createUserWithKey(input: {
    email: string | null;
    keyName: string;
    prefix: string;
    keyHash: string;
  }): Promise<{ userId: string; apiKeyId: string }> {
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        apiKeys: {
          create: { name: input.keyName, prefix: input.prefix, keyHash: input.keyHash },
        },
      },
      select: { id: true, apiKeys: { select: { id: true } } },
    });
    return { userId: user.id, apiKeyId: user.apiKeys[0]!.id };
  }

  async createKeyForUser(input: {
    userId: string;
    keyName: string;
    prefix: string;
    keyHash: string;
  }): Promise<{ apiKeyId: string }> {
    const key = await this.prisma.apiKey.create({
      data: {
        userId: input.userId,
        name: input.keyName,
        prefix: input.prefix,
        keyHash: input.keyHash,
      },
      select: { id: true },
    });
    return { apiKeyId: key.id };
  }

  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  async revokeKeyByPrefix(prefix: string, at: Date): Promise<boolean> {
    const result = await this.prisma.apiKey.updateMany({
      where: { prefix, revokedAt: null },
      data: { revokedAt: at },
    });
    return result.count > 0;
  }
}
