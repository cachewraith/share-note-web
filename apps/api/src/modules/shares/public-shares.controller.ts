import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CONTROLLER_PATHS, type PublicShareResponse } from '@share-note/contracts';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { Public } from '../auth/public.decorator';
import { ApiErrorDto, PublicShareResponseDto, ShareIdParamDto } from './shares.dto';
import { SharesService } from './shares.service';

/**
 * The viewer's data source. No authentication: possession of the unguessable id
 * is the capability. Nothing here exposes the owner.
 */
@Public()
@RateLimit('public')
@Controller(`${CONTROLLER_PATHS.public}/shares`)
export class PublicSharesController {
  constructor(private readonly shares: SharesService) {}

  @Get(':id')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'Fetch a shared note for rendering' })
  @ApiResponse({ status: 200, type: PublicShareResponseDto })
  @ApiResponse({ status: 404, description: 'No such share', type: ApiErrorDto })
  get(@Param() params: ShareIdParamDto): Promise<PublicShareResponse> {
    return this.shares.getPublic(params.id);
  }
}
