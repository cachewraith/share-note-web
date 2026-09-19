import { Global, Module } from '@nestjs/common';
import { type AppConfig, loadConfig } from './app.config';

/**
 * The single place `process.env` is read. The parsed config is a
 * container-scoped singleton (injected, never a static global) so tests can
 * supply their own without touching the environment.
 */
export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(process.env),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
