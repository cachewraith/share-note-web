import { ApiProperty } from '@nestjs/swagger';
import {
  CreateShareRequestSchema,
  CreateShareResponseSchema,
  ListSharesQuerySchema,
  ListSharesResponseSchema,
  PublicShareResponseSchema,
  ShareIdSchema,
  UpdateShareRequestSchema,
  UpdateShareResponseSchema,
} from '@share-note/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * DTOs are thin wrappers over the contract schemas — the API never defines a
 * shape of its own, so `packages/contracts` stays the single source of truth
 * and OpenAPI is generated from the same schemas the clients validate against.
 */
export class CreateShareDto extends createZodDto(CreateShareRequestSchema) {}
export class UpdateShareDto extends createZodDto(UpdateShareRequestSchema) {}
export class ListSharesQueryDto extends createZodDto(ListSharesQuerySchema) {}
export class ShareIdParamDto extends createZodDto(z.object({ id: ShareIdSchema })) {}

export class CreateShareResponseDto extends createZodDto(CreateShareResponseSchema) {}
export class UpdateShareResponseDto extends createZodDto(UpdateShareResponseSchema) {}
export class ListSharesResponseDto extends createZodDto(ListSharesResponseSchema) {}
export class PublicShareResponseDto extends createZodDto(PublicShareResponseSchema) {}

/** Documents the error envelope once so every route can reference it. */
export class ApiErrorDto {
  @ApiProperty({
    example: { code: 'NOT_FOUND', message: 'No such share' },
  })
  error!: { code: string; message: string };
}
