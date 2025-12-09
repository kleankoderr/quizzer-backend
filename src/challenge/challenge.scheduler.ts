import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChallengeService } from './challenge.service';

@Injectable()
export class ChallengeScheduler {
  private readonly logger = new Logger(ChallengeScheduler.name);

  constructor(private readonly challengeService: ChallengeService) {}

  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // @Cron(CronExpression.EVERY_MINUTE)
  async handleDailyCron() {
    this.logger.log('Running daily challenge generation...');
    try {
      await this.challengeService.generateDailyChallenges();
      this.logger.log('Daily challenges generated successfully.');
    } catch (error) {
      this.logger.error('Failed to generate daily challenges', error);
    }
  }

  @Cron('0 0 * * 0') // Every sunday at midnight
  async handleWeeklyCron() {
    this.logger.log('Running weekly challenge generation...');
    try {
      await this.challengeService.generateWeeklyChallenges();
      this.logger.log('Weekly challenges generated successfully.');
    } catch (error) {
      this.logger.error('Failed to generate weekly challenges', error);
    }
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlyCron() {
    this.logger.log('Running monthly challenge generation...');
    try {
      await this.challengeService.generateMonthlyChallenges();
      this.logger.log('Monthly challenges generated successfully.');
    } catch (error) {
      this.logger.error('Failed to generate monthly challenges', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleHotCron() {
    this.logger.log('Running hot challenge generation...');
    try {
      await this.challengeService.generateHotChallenges();
      this.logger.log('Hot challenges generated successfully.');
    } catch (error) {
      this.logger.error('Failed to generate hot challenges', error);
    }
  }
}
