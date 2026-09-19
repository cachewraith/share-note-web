import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../../config';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * The Prisma client as an injectable singleton.
 *
 * Prisma 7 takes its connection from a driver adapter rather than from the
 * schema, which is why the URL comes from the validated app config here and
 * from `prisma.config.ts` for the migration CLI.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.database.url }),
      // `warn` and `error` only: `query` logging would write note content to
      // the log on every write.
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Used by the readiness probe. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
