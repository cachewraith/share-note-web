import { Module } from '@nestjs/common';
import { ConfigModule } from './config';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [ConfigModule, HealthModule],
})
export class AppModule {}
