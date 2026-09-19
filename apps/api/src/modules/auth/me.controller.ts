import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { CONTROLLER_PATHS, type MeResponse } from '@share-note/contracts';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { CurrentUser } from './current-user.decorator';
import { type Principal } from './principal';

/**
 * Exists so the plugin's "Test connection" button has something to call that
 * proves the key works without creating anything.
 */
@ApiSecurity('apiKey')
@Controller(CONTROLLER_PATHS.me)
@RateLimit('read')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'Identify the caller behind the presented API key' })
  me(@CurrentUser() principal: Principal): MeResponse {
    return {
      userId: principal.userId,
      email: principal.email,
      createdAt: principal.userCreatedAt.toISOString(),
      apiKey: {
        id: principal.apiKeyId,
        name: principal.apiKeyName,
        prefix: principal.apiKeyPrefix,
      },
    };
  }
}
