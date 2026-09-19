import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * One connection, container-scoped and injected — never a module-level global.
 * Redis is used for rate limiting only; nothing durable lives here.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Redis => {
        const client = new Redis(config.redis.url, {
          // Fail a command quickly rather than queueing it while the socket is
          // down: the rate limiter has to decide now, not eventually.
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          connectTimeout: 2_000,
        });
        const logger = new Logger('Redis');
        // Without a listener, ioredis turns a connection blip into an
        // unhandled 'error' event and takes the process down.
        client.on('error', (error: Error) => {
          logger.warn(`connection error: ${error.message}`);
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
