import { Controller, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  ASSET_FILE_FIELD,
  CONTROLLER_PATHS,
  type CreateAssetResponse,
  EDIT_TOKEN_HEADER,
} from '@share-note/contracts';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { ApiErrorDto } from '../shares/shares.dto';
import { AssetsService } from './assets.service';
import { CreateAssetResponseDto, ShareIdParamDto } from './assets.dto';
import { type UploadedAsset, UploadedAssetFile } from './uploaded-asset.decorator';

@Controller(CONTROLLER_PATHS.shares)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post(':id/assets')
  @RateLimit('write')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { [ASSET_FILE_FIELD]: { type: 'string', format: 'binary' } },
      required: [ASSET_FILE_FIELD],
    },
  })
  @ApiHeader({ name: EDIT_TOKEN_HEADER, required: true, description: "The share's edit token" })
  @ApiOperation({ summary: 'Attach an image to a share' })
  @ApiResponse({ status: 201, type: CreateAssetResponseDto })
  @ApiResponse({ status: 415, description: 'Not an accepted image type', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'Attachment limit reached', type: ApiErrorDto })
  upload(
    @Param() params: ShareIdParamDto,
    @Headers(EDIT_TOKEN_HEADER) editToken: string | undefined,
    @UploadedAssetFile() file: UploadedAsset,
  ): Promise<CreateAssetResponse> {
    return this.assets.upload(params.id, editToken, file);
  }
}
