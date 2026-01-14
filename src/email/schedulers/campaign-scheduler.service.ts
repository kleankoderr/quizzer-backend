import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CampaignStrategy } from '../campaigns/campaign.strategy';
import { EmailCampaignService } from '../services/email-campaign.service';

@Injectable()
export class CampaignSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly campaignService: EmailCampaignService,
    @Inject('CAMPAIGN_STRATEGIES')
    private readonly strategies: CampaignStrategy[]
  ) {}

  async onModuleInit() {
    for (const strategy of this.strategies) {
      await this.scheduleCampaign(strategy);
    }
  }

  private async scheduleCampaign(strategy: CampaignStrategy) {
    try {
      const isEnabled = await strategy.isEnabled();

      if (!isEnabled) {
        this.logger.log(
          `Campaign '${strategy.id}' is disabled - skipping scheduling`
        );
        return;
      }

      const job = new CronJob(strategy.getCronExpression(), async () => {
        try {
          await this.campaignService.executeCampaign(strategy);
        } catch (error) {
          this.logger.error(
            `Campaign '${strategy.id}' execution failed: ${error.message}`,
            error.stack
          );
        }
      });

      this.registry.addCronJob(strategy.id, job);
      job.start();

      this.logger.log(
        `Scheduled campaign '${strategy.id}' with cron '${strategy.getCronExpression()}'`
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule campaign '${strategy.id}': ${error.message}`
      );
    }
  }
}
