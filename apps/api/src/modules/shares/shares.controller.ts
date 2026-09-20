import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  CONTROLLER_PATHS,
  type CreateShareResponse,
  EDIT_TOKEN_HEADER,
  type UpdateShareResponse,
} from '@share-note/contracts';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import {
  ApiErrorDto,
  CreateShareDto,
  CreateShareResponseDto,
  ShareIdParamDto,
  UpdateShareDto,
  UpdateShareResponseDto,
} from './shares.dto';
import { SharesService } from './shares.service';

/**
 * HTTP only: bind, delegate, return. Every rule about who may do what lives in
 * SharesService and EditTokenService, where it is unit-testable without a
 * request object.
 *
 * Nothing here authenticates. Publishing is open to anyone who can reach the
 * server; changing an existing share needs the edit token its creation
 * returned, presented in `X-Edit-Token`.
 */
@Controller(CONTROLLER_PATHS.shares)
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post()
  @RateLimit('write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish a note and get its public link' })
  @ApiResponse({ status: 201, type: CreateShareResponseDto })
  create(@Body() body: CreateShareDto): Promise<CreateShareResponse> {
    return this.shares.create(body);
  }

  @Put(':id')
  @RateLimit('write')
  @ApiHeader({ name: EDIT_TOKEN_HEADER, required: true, description: "The share's edit token" })
  @ApiOperation({ summary: 'Replace a note at the same link' })
  @ApiResponse({ status: 200, type: UpdateShareResponseDto })
  @ApiResponse({
    status: 404,
    description: 'No such share, or the edit token does not match it',
    type: ApiErrorDto,
  })
  update(
    @Param() params: ShareIdParamDto,
    @Headers(EDIT_TOKEN_HEADER) editToken: string | undefined,
    @Body() body: UpdateShareDto,
  ): Promise<UpdateShareResponse> {
    return this.shares.update(params.id, editToken, body);
  }

  @Delete(':id')
  @RateLimit('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader({ name: EDIT_TOKEN_HEADER, required: true, description: "The share's edit token" })
  @ApiOperation({ summary: 'Unshare: delete the note and its attachments' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({
    status: 404,
    description: 'No such share, or the edit token does not match it',
    type: ApiErrorDto,
  })
  remove(
    @Param() params: ShareIdParamDto,
    @Headers(EDIT_TOKEN_HEADER) editToken: string | undefined,
  ): Promise<void> {
    return this.shares.remove(params.id, editToken);
  }
}
