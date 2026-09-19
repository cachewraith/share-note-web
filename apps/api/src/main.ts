import 'reflect-metadata';

import helmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 2 * 1024 * 1024 }),
  );

  const config = app.get<AppConfig>(APP_CONFIG);

  await app.register(helmet, { contentSecurityPolicy: false });
  app.enableShutdownHooks();

  await app.listen({ port: config.port, host: config.host });
  new Logger('bootstrap').log(`API listening on http://${config.host}:${String(config.port)}`);
}

void bootstrap();
