import { AssetIdSchema, CreateAssetResponseSchema, ShareIdSchema } from '@share-note/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateAssetResponseDto extends createZodDto(CreateAssetResponseSchema) {}
export class AssetIdParamDto extends createZodDto(z.object({ id: AssetIdSchema })) {}
export class ShareIdParamDto extends createZodDto(z.object({ id: ShareIdSchema })) {}
