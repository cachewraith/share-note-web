import { z } from 'zod';
import { ERROR_CODES } from './constants';

export { ERROR_CODES, HTTP_STATUS_BY_ERROR_CODE, isErrorCode, type ErrorCode } from './constants';

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    /** Field-level detail, only ever present for VALIDATION_FAILED. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
