import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore({
          url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
          ttl: 300, // Default TTL of 5 minutes (in seconds)
          socket: {
            connectTimeout: 5000, // 5 second connection timeout
          },
          commandsQueueMaxLength: 500,
        }),
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
