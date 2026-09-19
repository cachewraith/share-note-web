import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';
import { AppError } from './app-error';

/**
 * Body, query and param validation, wired so a failure arrives at the exception
 * filter already shaped as a contract error rather than as Nest's default
 * BadRequest payload.
 *
 * `strictSchemaDeclaration` stays off because it also fires on parameters that
 * are not request data at all — `@CurrentUser()` and `@Res()` — and there is no
 * way to exempt them. What it would have caught is covered instead by every
 * `@Body`/`@Query`/`@Param` being a `createZodDto` class, and by the integration
 * tests asserting a 400 for malformed input on each route.
 */
export const AppValidationPipe = createZodValidationPipe({
  strictSchemaDeclaration: false,
  createValidationException: (error: unknown) => {
    if (error instanceof ZodError) {
      return AppError.validation(
        'Request validation failed',
        error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    }
    return AppError.validation('Request validation failed');
  },
});
