import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppErrorFilter } from './common/app-error.filter';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { AppValidationPipe } from './common/validation.pipe';
import { ConfigModule } from './config';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage';
import { ApiKeyGuard } from './modules/auth/api-key.guard';
import { AuthModule } from './modules/auth/auth.module';
import { AssetsModule } from './modules/assets/assets.module';
import { HealthModule } from './modules/health/health.module';
import { SharesModule } from './modules/shares/shares.module';

/**
 * Global guards run in the order they are registered here, and that order is
 * deliberate: rate limiting comes first so that a flood of bad keys is cheap to
 * refuse, then authentication, which is the expensive one (a database read and
 * a digest comparison).
 *
 * Both guards are global rather than per-controller, so a new route is rate
 * limited and authenticated unless it opts out in writing.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    AuthModule,
    SharesModule,
    AssetsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
