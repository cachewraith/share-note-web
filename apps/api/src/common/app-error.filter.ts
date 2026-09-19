import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { type ApiError, type ErrorCode, HTTP_STATUS_BY_ERROR_CODE } from '@share-note/contracts';
import { type FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app-error';

/**
 * The single place an exception becomes a response. Every route answers with the
 * contract's `{ error: { code, message } }` shape and nothing else, so a client
 * can branch on `code` and never has to parse prose.
 *
 * Unrecognised failures answer `INTERNAL_ERROR` with a fixed message. The real
 * error is logged server-side: a stack trace or a driver message in a response
 * body is an information leak (OWASP A09).
 */
@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body = toErrorBody(exception);
    const status = HTTP_STATUS_BY_ERROR_CODE[body.error.code];

    if (status >= 500) {
      // The request body is deliberately absent from this line: it is note content.
      this.logger.error(
        `${body.error.code} on ${reply.request.method} ${reply.request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    void reply.status(status).send(body);
  }
}

export function toErrorBody(exception: unknown): ApiError {
  if (exception instanceof AppError) {
    return {
      error: {
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      },
    };
  }

  if (exception instanceof ZodError) {
    return validationBody(exception);
  }

  if (exception instanceof HttpException) {
    const code = codeForStatus(exception.getStatus());
    return { error: { code, message: MESSAGE_BY_CODE[code] } };
  }

  return { error: { code: 'INTERNAL_ERROR', message: MESSAGE_BY_CODE.INTERNAL_ERROR } };
}

export function validationBody(error: ZodError): ApiError {
  return {
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  };
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'ASSET_LIMIT_REACHED',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

const MESSAGE_BY_CODE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Request validation failed',
  UNAUTHORIZED: 'Missing or invalid API key',
  FORBIDDEN: 'Not allowed',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  ASSET_LIMIT_REACHED: 'Attachment limit reached',
  TOO_MANY_REQUESTS: 'Too many requests',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  INTERNAL_ERROR: 'Internal server error',
};

/**
 * Anything Nest or Fastify raises that we have no code for becomes NOT_FOUND
 * when it is a client error (a 405 on an unrouted method says which methods
 * exist; 404 says nothing) and INTERNAL_ERROR otherwise.
 */
function codeForStatus(status: number): ErrorCode {
  const known = CODE_BY_STATUS[status];
  if (known) return known;
  return status >= 400 && status < 500 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
}
