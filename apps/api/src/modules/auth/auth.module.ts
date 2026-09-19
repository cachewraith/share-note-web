import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';

@Module({
  controllers: [MeController],
  providers: [AuthService, AuthRepository, ApiKeyGuard],
  exports: [AuthService, AuthRepository, ApiKeyGuard],
})
export class AuthModule {}
