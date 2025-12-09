import { Controller, Get, UseGuards, Req, Logger } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  private readonly logger = new Logger(InsightsController.name);

  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  async getInsights(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /insights - User: ${userId}`);
    return this.insightsService.generateInsights(userId);
  }
}
