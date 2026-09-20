import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppErrorFilter } from './common/app-error.filter';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { AppValidationPipe } from './common/validation.pipe';
import { ConfigModule } from './config';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage';
import { AssetsModule } from './modules/assets/assets.module';
import { HealthModule } from './modules/health/health.module';
import { SharesModule } from './modules/shares/shares.module';

/**
 * There is no authentication guard. This API does not have accounts: anyone who
 * can reach it may publish, and the only write that is restricted — changing or
 * deleting an existing share — is checked in the service layer against that
 * share's edit token (see EditTokenService).
 *
 * Rate limiting stays global rather than per-controller, so a new route is
 * limited unless it opts out in writing. With nothing to authenticate, it keys
 * on the client address for every caller.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    SharesModule,
    AssetsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
