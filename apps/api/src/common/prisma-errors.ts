/**
 * Prisma's error classes live in generated code; matching on the documented
 * error code keeps the service layer from importing the runtime just to do an
 * `instanceof`.
 */
export const PRISMA_UNIQUE_VIOLATION = 'P2002';
export const PRISMA_RECORD_NOT_FOUND = 'P2025';

export function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
