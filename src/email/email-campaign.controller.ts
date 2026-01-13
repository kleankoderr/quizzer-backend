import { Controller, Get, UseGuards } from '@nestjs/common';
import { EmailCampaignService } from './services/email-campaign.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('email/campaigns')
@UseGuards(JwtAuthGuard)
export class EmailCampaignController {
  constructor(private readonly emailCampaignService: EmailCampaignService) {}

  /**
   * Get campaign statistics (admin only - add role check in future)
   */
  @Get('stats')
  async getCampaignStats() {
    const campaigns = await this.emailCampaignService.getAllCampaignStats();
    return {
      success: true,
      data: campaigns,
    };
  }
}
