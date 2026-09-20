import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { type HealthResponse, type ReadyResponse, ROUTES } from '@share-note/contracts';
import { type FastifyReply } from 'fastify';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { HealthService } from './health.service';

/**
 * Probes are unauthenticated and exempt from rate limiting: an orchestrator has
 * to be able to ask "are you alive" even while the API is shedding load, and a
 * rate-limited probe would restart a healthy container.
 */
@RateLimit('none')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: answers as long as the process can serve a request. */
  @Get(ROUTES.health)
  @ApiExcludeEndpoint()
  live(): HealthResponse {
    return { status: 'ok' };
  }

  /**
   * Readiness. The body always reports every dependency; the status code is 503
   * when one is down, so a load balancer takes the instance out of rotation
   * without anyone having to parse the body.
   */
  @Get(ROUTES.ready)
  @ApiExcludeEndpoint()
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadyResponse> {
    const readiness = await this.health.readiness();
    void reply.status(
      readiness.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return readiness;
  }
}
