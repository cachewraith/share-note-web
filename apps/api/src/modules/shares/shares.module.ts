import { Module } from '@nestjs/common';
import { UrlBuilder } from '../../common/url.builder';
import { EditTokenService } from './edit-token.service';
import { PublicSharesController } from './public-shares.controller';
import { ShareRepository } from './share.repository';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  controllers: [SharesController, PublicSharesController],
  providers: [SharesService, EditTokenService, ShareRepository, UrlBuilder],
  exports: [SharesService, EditTokenService, ShareRepository, UrlBuilder],
})
export class SharesModule {}
