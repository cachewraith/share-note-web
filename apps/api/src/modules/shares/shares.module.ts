import { Module } from '@nestjs/common';
import { UrlBuilder } from '../../common/url.builder';
import { PublicSharesController } from './public-shares.controller';
import { ShareRepository } from './share.repository';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  controllers: [SharesController, PublicSharesController],
  providers: [SharesService, ShareRepository, UrlBuilder],
  exports: [SharesService, ShareRepository, UrlBuilder],
})
export class SharesModule {}
