import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CONTROLLER_PATHS } from '@share-note/contracts';
import { type FastifyReply } from 'fastify';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { Public } from '../auth/public.decorator';
import { ApiErrorDto } from '../shares/shares.dto';
import { AssetsService } from './assets.service';
import { AssetIdParamDto } from './assets.dto';
import { contentDisposition } from './filename';

/**
 * Streams an attachment. The `Content-Type` is the type we sniffed at upload,
 * never anything the uploader claimed, and `nosniff` stops a browser from
 * second-guessing it — together that is what keeps an image from being
 * interpreted as a document on our own origin.
 */
@Public()
@RateLimit('public')
@Controller(`${CONTROLLER_PATHS.public}/assets`)
export class PublicAssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Stream a shared attachment' })
  @ApiResponse({ status: 200, description: 'The image bytes' })
  @ApiResponse({ status: 404, description: 'No such attachment', type: ApiErrorDto })
  async get(@Param() params: AssetIdParamDto, @Res() reply: FastifyReply): Promise<void> {
    const asset = await this.assets.findServable(params.id);
    const stream = await this.assets.open(asset.storageKey);

    await reply
      .header('Content-Type', asset.mime)
      .header('Content-Length', String(asset.size))
      .header('Content-Disposition', contentDisposition(asset.filename))
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Robots-Tag', 'noindex, nofollow')
      // An id is minted per distinct content, so a given id's bytes never change.
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('ETag', `"${asset.sha256}"`)
      .send(stream);
  }
}
