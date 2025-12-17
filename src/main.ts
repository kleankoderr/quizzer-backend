import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import cluster from 'cluster';
import * as os from 'os';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

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

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Cache-Control',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposedHeaders: ['Cache-Control'],
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

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Quizzer API')
    .setDescription('The Quizzer API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const workerId = cluster.worker?.id || 'Primary';
  console.log(
    `🚀 Worker ${workerId} - Application is running on: http://localhost:${port}`
  );
  console.log(`📚 Worker ${workerId} - Swagger: http://localhost:${port}/api`);
}

// Cluster mode implementation
if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  const numWorkers = process.env.CLUSTER_WORKERS
    ? parseInt(process.env.CLUSTER_WORKERS)
    : numCPUs;

  console.log(`🎯 Primary process ${process.pid} is running`);
  console.log(`🔧 CPU cores: ${numCPUs}`);
  console.log(`👷 Spawning ${numWorkers} worker(s)...`);

  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  // Handle worker exit and respawn
  cluster.on('exit', (worker, code, signal) => {
    console.log(
      `⚠️  Worker ${worker.process.pid} died (${signal || code}). Restarting...`
    );
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received. Shutting down gracefully...');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill();
    }
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received. Shutting down gracefully...');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill();
    }
    process.exit(0);
  });
} else {
  // Worker process
  bootstrap();
}
