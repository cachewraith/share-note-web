import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppError } from '../../common/app-error';
import { type Principal, type RequestWithPrincipal } from './principal';

/**
 * The authenticated principal. Throws rather than returning undefined: reaching
 * a handler without one means ApiKeyGuard was bypassed, which is a bug, not a
 * request to serve anonymously.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!request.principal) throw AppError.unauthorized();
    return request.principal;
  },
);
