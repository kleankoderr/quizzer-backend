import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { CacheService } from '../../common/services/cache.service';
import { EmailService } from '../email.service';
import { CampaignStrategy } from '../campaigns/campaign.strategy';
import { CampaignStats } from '../interfaces/campaign.interface';

@Injectable()
export class EmailCampaignService {
  private readonly logger = new Logger(EmailCampaignService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService
  ) {}

  /**
   * Sends an email campaign to users based on the provided configuration
   */
  /**
   * Executes a campaign strategy
   */
  async executeCampaign(strategy: CampaignStrategy): Promise<CampaignStats> {
    this.logger.log(`Starting campaign: ${strategy.id}`);

    const stats: CampaignStats = {
      totalUsers: 0,
      emailsSent: 0,
      emailsSkipped: 0,
      emailsFailed: 0,
    };

    try {
      // Check if enabled
      const isEnabled = await strategy.isEnabled();
      if (!isEnabled) {
        this.logger.debug(`Campaign ${strategy.id} is disabled`);
        return stats;
      }

      // Check lock
      const isLocked = await this.isCampaignLocked(strategy.id);
      if (isLocked) {
        this.logger.warn(`Campaign ${strategy.id} is already running`);
        return stats;
      }

      // Lock campaign
      await this.lockCampaign(strategy.id);

      try {
        // Fetch eligible users
        const users = await strategy.getEligibleUsers();

        stats.totalUsers = users.length;
        this.logger.log(
          `Found ${stats.totalUsers} eligible users for campaign ${strategy.id}`
        );

        // Process users in batches
        const BATCH_SIZE = strategy.getBatchSize ? strategy.getBatchSize() : 50;
        const batches = this.chunkArray(users, BATCH_SIZE);

        this.logger.log(
          `Processing ${batches.length} batches of up to ${BATCH_SIZE} users`
        );

        for (let i = 0; i < batches.length; i++) {
          await this.processBatch(batches[i], strategy, stats);

          this.logger.log(
            `Batch ${i + 1}/${batches.length} completed. Total sent: ${stats.emailsSent}, skipped: ${stats.emailsSkipped}, failed: ${stats.emailsFailed}`
          );
        }

        this.logger.log(
          `Campaign ${strategy.id} completed. Sent: ${stats.emailsSent}, Skipped: ${stats.emailsSkipped}, Failed: ${stats.emailsFailed}`
        );

        // Store stats in cache for admin dashboard
        await this.storeCampaignStats(strategy.id, stats);

        return stats;
      } finally {
        // Always unlock
        await this.unlockCampaign(strategy.id);
      }
    } catch (error) {
      this.logger.error(
        `Campaign ${strategy.id} failed: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  private async processBatch(
    batch: Partial<User>[],
    strategy: CampaignStrategy,
    stats: CampaignStats
  ): Promise<void> {
    for (const user of batch) {
      if (!user.email || !user.id || !user.name) continue;

      try {
        // Check if user already received this email
        const alreadySent = await this.hasUserReceivedEmail(
          strategy.id,
          user.id
        );

        if (alreadySent) {
          stats.emailsSkipped++;
          this.logger.debug(
            `Skipping user ${user.email} - email already sent for campaign ${strategy.id}`
          );
          continue;
        }

        // Generate personalized email content
        const { subject, html, text } = await strategy.renderEmail(user);

        // Send email
        await this.emailService.sendEmail({
          to: user.email,
          subject,
          html,
          text,
        });

        // Mark as sent in cache
        await this.markEmailAsSent(
          strategy.id,
          user.id,
          strategy.getDeduplicationTtlDays()
        );

        stats.emailsSent++;
        this.logger.debug(
          `Email sent to ${user.email} for campaign ${strategy.id}`
        );
      } catch (error) {
        stats.emailsFailed++;
        this.logger.error(
          `Failed to send email to ${user.email} for campaign ${strategy.id}: ${error.message}`
        );
      }
    }
  }

  /**
   * Checks if a user has already received an email for a specific campaign
   */
  async hasUserReceivedEmail(
    campaignId: string,
    userId: string
  ): Promise<boolean> {
    const key = this.getCampaignUserKey(campaignId, userId);
    const value = await this.cacheService.get<boolean>(key);
    return !!value;
  }

  /**
   * Marks that an email has been sent to a user for a specific campaign
   */
  async markEmailAsSent(
    campaignId: string,
    userId: string,
    ttlDays: number = 30
  ): Promise<void> {
    const key = this.getCampaignUserKey(campaignId, userId);
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    await this.cacheService.set(key, true, ttlMs);
  }

  /**
   * Checks if a campaign is locked (currently running)
   */
  async isCampaignLocked(campaignId: string): Promise<boolean> {
    const key = this.getCampaignLockKey(campaignId);
    const value = await this.cacheService.get<boolean>(key);
    return !!value;
  }

  /**
   * Locks a campaign to prevent concurrent execution
   */
  async lockCampaign(
    campaignId: string,
    ttlMinutes: number = 5
  ): Promise<void> {
    const key = this.getCampaignLockKey(campaignId);
    const ttlMs = ttlMinutes * 60 * 1000;
    await this.cacheService.set(key, true, ttlMs);
  }

  /**
   * Unlocks a campaign
   */
  async unlockCampaign(campaignId: string): Promise<void> {
    const key = this.getCampaignLockKey(campaignId);
    await this.cacheService.invalidate(key);
  }

  // Private helper methods for cache keys
  private getCampaignUserKey(campaignId: string, userId: string): string {
    return `email:campaign:${campaignId}:${userId}`;
  }

  private getCampaignLockKey(campaignId: string): string {
    return `email:campaign:${campaignId}:lock`;
  }

  /**
   * Splits an array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Stores campaign statistics in cache
   */
  async storeCampaignStats(
    campaignId: string,
    stats: CampaignStats
  ): Promise<void> {
    const key = this.getCampaignStatsKey(campaignId);
    const data = {
      ...stats,
      lastUpdated: new Date().toISOString(),
    };
    // Store for 30 days
    await this.cacheService.set(key, data, 30 * 24 * 60 * 60 * 1000);
  }

  /**
   * Retrieves campaign statistics from cache
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    const key = this.getCampaignStatsKey(campaignId);
    return await this.cacheService.get<CampaignStats>(key);
  }

  /**
   * Retrieves all campaign statistics
   */
  async getAllCampaignStats(): Promise<
    Array<{
      campaignId: string;
      stats: CampaignStats & { lastUpdated: string };
    }>
  > {
    // For now, we'll return stats for known campaigns
    // In production, you might want to store a list of campaign IDs
    const knownCampaigns = ['welcome-back-2026-01'];
    const results = [];

    for (const campaignId of knownCampaigns) {
      const stats = await this.cacheService.get<
        CampaignStats & { lastUpdated: string }
      >(this.getCampaignStatsKey(campaignId));
      if (stats) {
        results.push({ campaignId, stats });
      }
    }

    return results;
  }

  private getCampaignStatsKey(campaignId: string): string {
    return `email:campaign:${campaignId}:stats`;
  }
}
