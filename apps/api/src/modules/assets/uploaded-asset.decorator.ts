import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ASSET_FILE_FIELD } from '@share-note/contracts';
import { type FastifyRequest } from 'fastify';
import { AppError } from '../../common/app-error';

export interface UploadedAsset {
  readonly filename: string;
  readonly bytes: Buffer;
}

/**
 * Pulls the single uploaded part out of a multipart request.
 *
 * Extraction only: what the bytes are allowed to be is decided by AssetsService,
 * where it can be tested without a request. The byte ceiling is enforced by
 * @fastify/multipart, configured from the app config in main.ts, so an
 * oversized upload is cut off at the socket rather than buffered first.
 */
export const UploadedAssetFile = createParamDecorator(
  async (_data: unknown, context: ExecutionContext): Promise<UploadedAsset> => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (!request.isMultipart()) {
      throw AppError.unsupportedMediaType('Expected a multipart/form-data body');
    }

    const part = await request.file().catch((error: unknown) => {
      if (isFileTooLarge(error)) {
        throw AppError.payloadTooLarge('Attachment is larger than this server accepts');
      }
      throw AppError.validation('Could not read the multipart body');
    });

    if (!part) {
      throw AppError.validation(`Expected a file part named "${ASSET_FILE_FIELD}"`);
    }
    if (part.fieldname !== ASSET_FILE_FIELD) {
      throw AppError.validation(`Expected a file part named "${ASSET_FILE_FIELD}"`);
    }

    const bytes = await part.toBuffer().catch((error: unknown) => {
      if (isFileTooLarge(error)) {
        throw AppError.payloadTooLarge('Attachment is larger than this server accepts');
      }
      throw AppError.validation('Could not read the uploaded file');
    });

    return { filename: part.filename, bytes };
  },
);

function isFileTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'FST_REQ_FILE_TOO_LARGE'
  );
}
