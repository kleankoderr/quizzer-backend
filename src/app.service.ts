import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async onApplicationBootstrap() {
    await this.clearCache();
  }

  private async clearCache() {
    this.logger.log('Clearing cache on application startup...');
    try {
      const cacheManager = this.cacheManager as any;
      const store = cacheManager.store;

      if (store && typeof store.reset === 'function') {
        await store.reset();
      } else if (typeof cacheManager.reset === 'function') {
        await cacheManager.reset();
      } else if (typeof cacheManager.clear === 'function') {
        await cacheManager.clear();
      }
      this.logger.log('Cache cleared successfully.');
    } catch (error) {
      this.logger.error('Failed to clear cache on startup', error);
    }
  }

  getHello(): string {
    return 'Welcome to Quizzer API - AI-Powered Quiz & Flashcard Generation';
  }
}
