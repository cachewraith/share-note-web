import { type ApiError, type ErrorCode } from '@share-note/contracts';

type ValidationDetails = NonNullable<ApiError['error']['details']>;

/**
 * The one error type the service layer throws. It carries a contract error code
 * rather than an HTTP status, so business rules stay free of HTTP concerns; the
 * exception filter is what turns it into a response.
 *
 * `message` is always safe to show a client — it is written for that. Anything
 * that must not leak (a driver message, a stack) stays in the `cause`, which
 * only the filter's logger reads.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: ValidationDetails;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ValidationDetails; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    if (options.details) this.details = options.details;
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static unauthorized(message = 'Missing or invalid API key'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'Not allowed'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static validation(message: string, details?: ValidationDetails): AppError {
    return new AppError('VALIDATION_FAILED', message, details ? { details } : {});
  }

  static payloadTooLarge(message: string): AppError {
    return new AppError('PAYLOAD_TOO_LARGE', message);
  }

  static unsupportedMediaType(message: string): AppError {
    return new AppError('UNSUPPORTED_MEDIA_TYPE', message);
  }

  static assetLimitReached(message: string): AppError {
    return new AppError('ASSET_LIMIT_REACHED', message);
  }

  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError('TOO_MANY_REQUESTS', message);
  }

  static serviceUnavailable(message: string, cause?: unknown): AppError {
    return new AppError('SERVICE_UNAVAILABLE', message, { cause });
  }

  static internal(message = 'Internal server error', cause?: unknown): AppError {
    return new AppError('INTERNAL_ERROR', message, { cause });
  }
}
