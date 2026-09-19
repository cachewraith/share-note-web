import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_HEADER, AUTH_SCHEME } from '@share-note/contracts';
import { AppError } from '../../common/app-error';
import { AuthService } from './auth.service';
import { type RequestWithPrincipal } from './principal';
import { IS_PUBLIC_ROUTE } from './public.decorator';

/**
 * Registered globally, so every route requires a valid API key unless it is
 * explicitly marked `@Public()`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const presented = readBearerToken(request);
    if (!presented) throw AppError.unauthorized();

    const principal = await this.authService.authenticate(presented);
    if (!principal) throw AppError.unauthorized();

    request.principal = principal;
    return true;
  }
}

function readBearerToken(request: RequestWithPrincipal): string | null {
  // `request.raw.headers` and not `request.headers`: Fastify types the latter
  // as `RawRequest['headers'] & RequestType['headers']`, which collapses to
  // `any` for a route with no schema, silently disabling the checks below.
  // Node keeps a single value for `authorization` even if the client sends it
  // twice, so there is no array case to handle.
  const raw = request.raw.headers[AUTH_HEADER];
  if (raw === undefined) return null;

  const prefix = `${AUTH_SCHEME} `;
  if (!raw.startsWith(prefix)) return null;

  const token = raw.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}
