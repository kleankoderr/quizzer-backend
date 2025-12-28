import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class SubscriptionScheduler {
  private readonly logger = new Logger(SubscriptionScheduler.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Handle expired subscriptions daily at midnight
   * Finds all ACTIVE subscriptions with currentPeriodEnd < now
   * Updates status to EXPIRED and resets user quotas to free tier
   */
  @Cron('0 0 * * *') // Daily at midnight
  async handleExpirations() {
    this.logger.log('Running subscription expiration check...');
    try {
      const count = await this.subscriptionService.handleExpiredSubscriptions();
      this.logger.log(
        `Subscription expiration check completed. Processed ${count} subscription(s).`
      );
    } catch (error) {
      this.logger.error('Failed to process expired subscriptions', error);
    }
  }

  /**
   * Clean up abandoned payments every 6 hours
   */
  @Cron('0 */6 * * *') // Every 6 hours
  async cleanupPayments() {
    this.logger.log('Running payment cleanup job...');
    try {
      const count = await this.subscriptionService.cleanupAbandonedPayments();
      this.logger.log(`Payment cleanup completed. Cleaned ${count} payments.`);
    } catch (error) {
      this.logger.error('Failed to clean up payments', error);
    }
  }
}
