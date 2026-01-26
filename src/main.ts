import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

function parseEnvList(key: string): string[] {
  return (
    process.env[key]
      ?.split(',')
      .map((v) => v.trim())
      .filter(Boolean) || []
  );
}

async function bootstrap() {
  const startedAt = Date.now();

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  const httpAdapterHost = app.get(HttpAdapterHost);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(json({ limit: '50mb' }));

  configureCors(app);
  configureGlobals(app, httpAdapterHost);
  configureSwagger(app);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  console.log(
    `🚀 Server running on port ${port} (${Date.now() - startedAt}ms)`
  );
}

/* ---------------------------- Configuration ---------------------------- */

function configureCors(app: any) {
  const allowedOrigins = parseEnvList('ALLOWED_ORIGINS');
  const allowedOriginPatterns = parseEnvList('ALLOWED_ORIGIN_PATTERNS').map(
    (p) => new RegExp(p)
  );

  if (allowedOrigins.length) {
    console.log(`🔒 CORS origins: ${allowedOrigins.join(', ')}`);
  }

  if (allowedOriginPatterns.length) {
    console.log(
      `🔒 CORS patterns: ${allowedOriginPatterns.map(String).join(', ')}`
    );
  }

  app.enableCors({
    origin: (origin: string | undefined, callback: Function) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (allowedOriginPatterns.some((pattern) => pattern.test(origin))) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Cache-Control',
      'X-Requested-With',
      'ngrok-skip-browser-warning',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });
}

function configureGlobals(app: any, httpAdapterHost: HttpAdapterHost) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  app.useGlobalFilters(
    new GlobalExceptionFilter(httpAdapterHost)
  );

  app.useGlobalInterceptors(
    new ResponseTransformInterceptor()
  );
}

function configureSwagger(app: any) {
  if (process.env.NODE_ENV !== 'development') return;

  const config = new DocumentBuilder()
    .setTitle('Quizzer API')
    .setDescription('Quizzer public API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  console.log('📚 Swagger available at /api');
}

bootstrap();
