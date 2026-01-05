import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { createClient } from 'redis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://localhost:6379'
        );
        return {
          stores: [new KeyvRedis(redisUrl)],
          ttl: 300000, // 5 minutes in milliseconds
        };
      },
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://localhost:6379'
        );
        const client = createClient({ url: redisUrl });
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [NestCacheModule, REDIS_CLIENT],
})
export class CacheModule {}
