import { Injectable, Logger } from '@nestjs/common';
import Redlock from 'redlock';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);
  private readonly redlock: Redlock;

  constructor(private readonly configService: ConfigService) {
    const redisClient = new Redis(this.configService.get<string>('REDIS_URL'));

    this.redlock = new Redlock([redisClient as any], {
      driftFactor: 0.01,
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 200,
    });

    this.redlock.on('clientError', (err) => {
      this.logger.error('Redlock client error:', err);
    });
  }

  async acquireLock(resource: string, ttl: number = 10000) {
    try {
      return await this.redlock.acquire([resource], ttl);
    } catch (error) {
      this.logger.error(`Failed to acquire lock for ${resource}:`, error);
      throw error;
    }
  }
}
