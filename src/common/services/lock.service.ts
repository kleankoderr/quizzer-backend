import { Injectable, Logger, Inject } from '@nestjs/common';
import Redlock from 'redlock';
import { createClient } from 'redis';
import { REDIS_CLIENT } from '../../cache/cache.module';

type RedisClientType = ReturnType<typeof createClient>;

@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);
  private readonly redlock: Redlock;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType
  ) {
    // Create an adapter for Redlock to bridge the signature mismatch with node-redis v5+
    // Redlock expects: client.evalsha(hash, keysCount, [...keys, ...args])
    // node-redis expects: client.evalSha(hash, { keys, arguments })
    const redlockAdapter = {
      eval: (script: string, keysCount: number, allArgs: string[]) =>
        this.redisClient.eval(script, {
          keys: allArgs.slice(0, keysCount),
          arguments: allArgs.slice(keysCount).map(String),
        }),
      evalsha: (sha: string, keysCount: number, allArgs: string[]) =>
        this.redisClient.evalSha(sha, {
          keys: allArgs.slice(0, keysCount),
          arguments: allArgs.slice(keysCount).map(String),
        }),
    };

    this.redlock = new Redlock([redlockAdapter as any], {
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
