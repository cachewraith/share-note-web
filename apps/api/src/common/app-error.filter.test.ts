import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { HTTP_STATUS_BY_ERROR_CODE } from '@share-note/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from './app-error';
import { toErrorBody } from './app-error.filter';

describe('toErrorBody', () => {
  it('passes an AppError through with its code and message', () => {
    expect(toErrorBody(AppError.notFound('No such share'))).toEqual({
      error: { code: 'NOT_FOUND', message: 'No such share' },
    });
  });

  it('includes field details for a validation failure', () => {
    const body = toErrorBody(
      AppError.validation('Request validation failed', [{ path: 'title', message: 'Too small' }]),
    );
    expect(body.error.details).toEqual([{ path: 'title', message: 'Too small' }]);
  });

  it('turns a raw ZodError into a validation failure', () => {
    const result = z.object({ title: z.string().min(1) }).safeParse({ title: '' });
    const body = toErrorBody(result.error);

    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details?.[0]?.path).toBe('title');
  });

  it('maps a Nest HttpException to the matching contract code', () => {
    expect(toErrorBody(new NotFoundException()).error.code).toBe('NOT_FOUND');
    expect(toErrorBody(new ForbiddenException()).error.code).toBe('FORBIDDEN');
  });

  it('maps an unmapped client error to NOT_FOUND rather than leaking which methods exist', () => {
    expect(toErrorBody(new HttpException('Method Not Allowed', 405)).error.code).toBe('NOT_FOUND');
  });

  it.each([
    ['a plain Error', new Error('connection string postgres://user:hunter2@db/app')],
    ['a thrown string', 'boom'],
    ['null', null],
  ])('answers INTERNAL_ERROR for %s', (_label, thrown) => {
    expect(toErrorBody(thrown)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('never echoes the original message of an unexpected failure', () => {
    const body = toErrorBody(new Error('password=hunter2'));
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('never includes a stack trace', () => {
    const error = new Error('kaboom');
    expect(JSON.stringify(toErrorBody(error))).not.toContain('at ');
  });

  it('produces a code that the contract maps to a status', () => {
    for (const thrown of [AppError.tooManyRequests(), new NotFoundException(), new Error('x')]) {
      expect(HTTP_STATUS_BY_ERROR_CODE[toErrorBody(thrown).error.code]).toBeGreaterThanOrEqual(400);
    }
  });
});
