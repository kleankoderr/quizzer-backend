import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SubscriptionService } from '../src/subscription/subscription.service';

/**
 * Test script to manually trigger the subscription expiration cron job
 * Usage: ts-node scripts/test-subscription-cron.ts
 */
async function testSubscriptionCron() {
  console.log('Starting subscription cron job test...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const subscriptionService = app.get(SubscriptionService);

  try {
    console.log('Calling handleExpiredSubscriptions()...\n');
    const count = await subscriptionService.handleExpiredSubscriptions();
    console.log(`\n✅ Test completed. Processed ${count} subscription(s).`);
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await app.close();
  }
}

testSubscriptionCron();
