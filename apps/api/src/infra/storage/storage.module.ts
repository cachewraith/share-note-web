import { Global, Module } from '@nestjs/common';
import { S3Storage } from './s3.storage';
import { STORAGE_PORT } from './storage.port';

/**
 * Binds the port to the S3 adapter. Swapping backends is a one-line change
 * here; nothing else in the app names S3.
 */
@Global()
@Module({
  providers: [{ provide: STORAGE_PORT, useClass: S3Storage }],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
