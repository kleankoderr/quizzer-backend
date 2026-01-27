import { NestFactory } from '@nestjs/core';
import { CacheService } from '../common/services/cache.service';
import { AppModule } from '../app.module';

async function verifyCache() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cacheService = app.get(CacheService);

  const testKey = 'test_invalidation_key';
  const testValue = { foo: 'bar' };

  console.log('Setting cache key...');
  await cacheService.set(testKey, testValue, 60000);

  const retrieved = await cacheService.get(testKey);
  console.log('Retrieved immediately:', retrieved);

  if (!retrieved) {
    console.error('Cache set failed!');
    process.exit(1);
  }

  console.log('Invalidating cache key...');
  await cacheService.invalidate(testKey);

  const retrievedAfterInvalidate = await cacheService.get(testKey);
  console.log('Retrieved after invalidate:', retrievedAfterInvalidate);

  if (retrievedAfterInvalidate) {
    console.error('Cache invalidation FAILED!');
    process.exit(1);
  }

  console.log('Cache invalidation SUCCEEDED!');
  await app.close();
}

verifyCache().catch(console.error);
