import type { ErrorCode } from '@share-note/contracts/lite';

/**
 * A failure the user can be told about.
 *
 * `code` is the contract's code when the server sent one, or one of the two
 * local codes below when the request never got an answer. The UI turns it into
 * a sentence; nothing else in the plugin inspects HTTP status codes.
 */
export type ShareErrorCode = ErrorCode | 'NETWORK_ERROR' | 'BAD_RESPONSE';

export class ShareApiError extends Error {
  constructor(
    readonly code: ShareErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ShareApiError';
  }
}

const MESSAGES: Record<ShareErrorCode, string> = {
  VALIDATION_FAILED: 'The server rejected the note. It may be too large or have an empty title.',
  UNAUTHORIZED: 'The API key was rejected. Check it in the share-note settings.',
  FORBIDDEN: 'This key is not allowed to do that.',
  NOT_FOUND: 'That note is not shared any more. Share it again to get a new link.',
  CONFLICT: 'The server reported a conflict. Try again.',
  PAYLOAD_TOO_LARGE: 'The note or attachment is larger than the server accepts.',
  UNSUPPORTED_MEDIA_TYPE: 'Only PNG, JPEG, GIF and WebP attachments can be shared.',
  ASSET_LIMIT_REACHED: 'This note has reached the server limit for attachments.',
  TOO_MANY_REQUESTS: 'Too many requests. Wait a minute and try again.',
  SERVICE_UNAVAILABLE: 'The server is not ready. Try again shortly.',
  INTERNAL_ERROR: 'The server hit an error. Check its logs.',
  NETWORK_ERROR: 'Could not reach the server. Check the server URL and your connection.',
  BAD_RESPONSE: 'The server replied with something unexpected. Is the URL a share-note server?',
};

/** A sentence for a Notice. Sentence case, no jargon, says what to do next. */
export function describeError(error: unknown): string {
  if (error instanceof ShareApiError) {
    return MESSAGES[error.code];
  }
  return 'Something went wrong. See the developer console for details.';
}
