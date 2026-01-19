import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { REDIS_CLIENT } from '../../cache/cache.module';
import { RedisClientType } from 'redis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      return (await this.cacheManager.get(key)) as T | null;
    } catch (error) {
      this.logger.warn(`Cache get failed for ${key}: ${error.message}`);
      return null;
    }
  }

  async set(key: string, value: any, ttlMs?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttlMs);
    } catch (error) {
      this.logger.warn(`Cache set failed for ${key}: ${error.message}`);
    }
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    try {
      const keys: string[] = [];
      let cursor = '0';

      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = result.cursor.toString();
        keys.push(...result.keys);
      } while (cursor !== '0');

      if (keys.length > 0) {
        const pipeline = this.redisClient.multi();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
        this.logger.debug(`Invalidated ${keys.length} keys: ${pattern}`);
      }
    } catch (error) {
      this.logger.warn(
        `Cache invalidation failed for ${pattern}: ${error.message}`
      );
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.warn(
        `Cache invalidation failed for ${key}: ${error.message}`
      );
    }
  }

  async invalidateMultiple(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.invalidate(key)));
  }
}
