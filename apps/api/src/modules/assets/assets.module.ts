import { Module } from '@nestjs/common';
import { SharesModule } from '../shares/shares.module';
import { AssetRepository } from './asset.repository';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { PublicAssetsController } from './public-assets.controller';

@Module({
  imports: [SharesModule],
  controllers: [AssetsController, PublicAssetsController],
  providers: [AssetsService, AssetRepository],
  exports: [AssetsService, AssetRepository],
})
export class AssetsModule {}
