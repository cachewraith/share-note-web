import { Inject, Injectable } from '@nestjs/common';
import { type ReadyResponse } from '@share-note/contracts';
import { Redis } from 'ioredis';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../../infra/redis/redis.module';
import { STORAGE_PORT, type StoragePort } from '../../infra/storage';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** Checks run concurrently; one slow dependency must not hide the others. */
  async readiness(): Promise<ReadyResponse> {
    const [database, redis, storage] = await Promise.all([
      this.prisma.isReachable(),
      this.pingRedis(),
      this.storage.isReachable(),
    ]);

    const checks = {
      database: database ? ('up' as const) : ('down' as const),
      redis: redis ? ('up' as const) : ('down' as const),
      storage: storage ? ('up' as const) : ('down' as const),
    };

    return {
      status: database && redis && storage ? 'ready' : 'degraded',
      checks,
    };
  }

  private async pingRedis(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
