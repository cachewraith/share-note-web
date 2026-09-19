import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ROUTES } from '@share-note/contracts';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { type AppConfig } from './config';

/** JSON framing plus worst-case escaping around the markdown limit. */
const BODY_OVERHEAD_BYTES = 64 * 1024;

export async function createApp(): Promise<{ app: NestFastifyApplication; config: AppConfig }> {
  // The config is parsed here as well as inside the container, because the
  // Fastify adapter needs its limits before Nest has built anything.
  const { loadConfig } = await import('./config');
  const config = loadConfig(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: config.trustProxy,
      bodyLimit: config.limits.markdownMaxBytes * 2 + BODY_OVERHEAD_BYTES,
      // Fastify's own ids; we never echo them, they are for log correlation.
      genReqId: () => crypto.randomUUID(),
    }),
    { bufferLogs: true, logger: logLevelsFor(config) },
  );

  await app.register(helmet, {
    // The API serves JSON and images, never a document, so the interesting
    // headers are the ones that stop a browser from treating a response as one.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.limits.assetMaxBytes,
      files: 1,
      fields: 4,
      // A part header long enough to matter is an attack, not a filename.
      fieldNameSize: 200,
      headerPairs: 64,
    },
    throwFileSizeLimit: true,
  });

  app.enableCors({
    // Empty list means no browser origin is allowed, which is the right default:
    // the viewer is server-rendered and the plugin is not a browser.
    origin: config.corsAllowedOrigins.length > 0 ? [...config.corsAllowedOrigins] : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });

  // Nothing this API serves should ever end up in an index.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (_request, reply, payload, done) => {
      void reply.header('X-Robots-Tag', 'noindex, nofollow');
      done(null, payload);
    });

  if (config.enableDocs) {
    registerDocs(app);
  }

  app.enableShutdownHooks();
  return { app, config };
}

function registerDocs(app: NestFastifyApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('share-note')
      .setDescription('Publish a single note to a public link.')
      .setVersion('1')
      .addSecurity('apiKey', {
        type: 'http',
        scheme: 'bearer',
        description: 'An API key created with `pnpm --filter @share-note/api cli create-user`.',
      })
      .build(),
  );
  SwaggerModule.setup(ROUTES.docs.slice(1), app, cleanupOpenApiDoc(document));
}

function logLevelsFor(config: AppConfig): ('log' | 'error' | 'warn' | 'debug' | 'verbose')[] {
  switch (config.logLevel) {
    case 'fatal':
    case 'error':
      return ['error'];
    case 'warn':
      return ['error', 'warn'];
    case 'info':
      return ['error', 'warn', 'log'];
    case 'debug':
      return ['error', 'warn', 'log', 'debug'];
    case 'trace':
      return ['error', 'warn', 'log', 'debug', 'verbose'];
  }
}

export async function bootstrap(): Promise<void> {
  const { app, config } = await createApp();
  await app.listen({ port: config.port, host: config.host });
  new Logger('bootstrap').log(
    `share-note API listening on http://${config.host}:${String(config.port)}` +
      (config.enableDocs ? ` (docs at ${ROUTES.docs})` : ''),
  );
}
