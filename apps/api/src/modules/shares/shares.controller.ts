import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import {
  CONTROLLER_PATHS,
  type CreateShareResponse,
  type ListSharesResponse,
  type UpdateShareResponse,
} from '@share-note/contracts';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { type Principal } from '../auth/principal';
import {
  ApiErrorDto,
  CreateShareDto,
  CreateShareResponseDto,
  ListSharesQueryDto,
  ListSharesResponseDto,
  ShareIdParamDto,
  UpdateShareDto,
  UpdateShareResponseDto,
} from './shares.dto';
import { SharesService } from './shares.service';

/**
 * HTTP only: bind, delegate, return. Every rule about who may do what lives in
 * SharesService, where it is unit-testable without a request object.
 */
@ApiSecurity('apiKey')
@ApiResponse({ status: 401, description: 'Missing or invalid API key', type: ApiErrorDto })
@Controller(CONTROLLER_PATHS.shares)
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post()
  @RateLimit('write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish a note and get its public link' })
  @ApiResponse({ status: 201, type: CreateShareResponseDto })
  create(
    @CurrentUser() principal: Principal,
    @Body() body: CreateShareDto,
  ): Promise<CreateShareResponse> {
    return this.shares.create(principal, body);
  }

  @Put(':id')
  @RateLimit('write')
  @ApiOperation({ summary: 'Replace a note at the same link' })
  @ApiResponse({ status: 200, type: UpdateShareResponseDto })
  @ApiResponse({ status: 404, description: 'No such share', type: ApiErrorDto })
  update(
    @CurrentUser() principal: Principal,
    @Param() params: ShareIdParamDto,
    @Body() body: UpdateShareDto,
  ): Promise<UpdateShareResponse> {
    return this.shares.update(principal, params.id, body);
  }

  @Delete(':id')
  @RateLimit('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unshare: delete the note and its attachments' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'No such share', type: ApiErrorDto })
  remove(@CurrentUser() principal: Principal, @Param() params: ShareIdParamDto): Promise<void> {
    return this.shares.remove(principal, params.id);
  }

  @Get()
  @RateLimit('read')
  @ApiOperation({ summary: 'List the notes this key has shared' })
  @ApiResponse({ status: 200, type: ListSharesResponseDto })
  list(
    @CurrentUser() principal: Principal,
    @Query() query: ListSharesQueryDto,
  ): Promise<ListSharesResponse> {
    return this.shares.list(principal, query);
  }
}
