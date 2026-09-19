import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { type HealthResponse, ROUTES } from '@share-note/contracts';

/** Liveness only: answers as long as the process can serve a request. */
@Controller()
export class HealthController {
  @Get(ROUTES.health)
  @ApiExcludeEndpoint()
  live(): HealthResponse {
    return { status: 'ok' };
  }
}
