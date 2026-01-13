import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';
import { OtpEmailListener } from './listeners/otp-email.listener';
import { PasswordResetListener } from './listeners/password-reset.listener';
import { EmailCampaignService } from './services/email-campaign.service';
import { CampaignSchedulerService } from './schedulers/campaign-scheduler.service';
import { WelcomeBackCampaign } from './campaigns/welcome-back.campaign';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { EmailCampaignController } from './email-campaign.controller';

@Global()
@Module({
  imports: [PrismaModule, CommonModule],
  providers: [
    EmailService,
    OtpEmailListener,
    PasswordResetListener,
    EmailCampaignService,
    CampaignSchedulerService,
    WelcomeBackCampaign,
    {
      provide: 'CAMPAIGN_STRATEGIES',
      useFactory: (welcomeBack: WelcomeBackCampaign) => [welcomeBack],
      inject: [WelcomeBackCampaign],
    },
  ],
  controllers: [EmailCampaignController],
  exports: [EmailService, EmailCampaignService],
})
export class EmailModule {}
