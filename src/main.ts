import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
// import { doubleCsrfProtection } from "./config/csrf.config";
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  // Trigger restart - DB Synced
  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.get(HttpAdapterHost);

  // Register global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

  // Register global response transform interceptor
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Trust proxy is required for cookies to work behind a load balancer (like Render)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Enable body parsing explicitly
  app.use(json({ limit: '50mb' }));

  // Enable CORS - Allow all origins with SSE support
  app.enableCors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Cache-Control',
    ],
    exposedHeaders: ['Cache-Control', 'X-Accel-Buffering'], // Required for SSE
  });

  // Use cookie-parser middleware
  app.use(cookieParser());

  // Use CSRF protection middleware if enabled
  // if (process.env.CSRF_ENABLED === "true") {
  //   app.use(doubleCsrfProtection);
  // }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  // Swagger documentation setup
  const config = new DocumentBuilder()
    .setTitle('Quizzer API')
    .setDescription('AI-Powered Quiz and Flashcard Generation API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Authentication', 'User authentication endpoints')
    .addTag('Quizzes', 'Quiz generation and management')
    .addTag('Flashcards', 'Flashcard generation and management')
    .addTag('Streaks', 'User learning streak tracking')
    .addTag('Leaderboard', 'Global and friend leaderboards')
    .addTag('Challenges', 'Daily, weekly, and monthly challenges')
    .addTag('Recommendations', 'Personalized topic recommendations')
    .addTag('Attempts', 'Quiz and flashcard attempt history')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
