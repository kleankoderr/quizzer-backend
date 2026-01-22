import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  const startTime = Date.now();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  console.log(`✅ Application created in ${Date.now() - startTime}ms`);

  // Get HTTP adapter for exception filter
  const httpAdapter = app.get(HttpAdapterHost);

  // Set trust proxy for accurate IP addresses behind load balancers
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Use custom JSON parser with size limit
  app.use(json({ limit: '50mb' }));

  // Enable CORS with specific origins for security
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:5173',
    'https://quizr-it.vercel.app',
  ];

  // Allowed origin patterns (for wildcard matching like Vercel/Railway preview deployments)
  const allowedOriginPatterns =
    process.env.ALLOWED_ORIGIN_PATTERNS?.split(',') || [];

  app.enableCors({
    origin: (origin: any, callback: any) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Check exact matches
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check pattern matches
      const matchesPattern = allowedOriginPatterns.some((pattern) => {
        if (!pattern) return false;
        // Simple wildcard support if pattern contains *
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.split('*').join('.*') + '$');
          return regex.test(origin);
        }
        return origin.startsWith(pattern);
      });

      if (matchesPattern) {
        return callback(null, true);
      }

      // Origin not allowed
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Cache-Control',
      'X-Requested-With',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposedHeaders: ['Set-Cookie'],
  });

  // Use cookie-parser middleware
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

  // Global response transform interceptor
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Swagger setup (only in development)
  if (process.env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('Quizzer API')
      .setDescription('The Quizzer API description')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
    console.log('📚 Swagger documentation available at /api');
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const totalTime = Date.now() - startTime;
  console.log(`🎉 Application started on port ${port} in ${totalTime}ms`);
}

bootstrap();
