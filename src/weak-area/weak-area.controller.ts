import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { WeakAreaService } from './weak-area.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CheckQuota } from '../common/decorators/check-quota.decorator';
import { QuotaService } from '../common/services/quota.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('weak-areas')
@UseGuards(JwtAuthGuard)
export class WeakAreaController {
  private readonly logger = new Logger(WeakAreaController.name);

  constructor(
    private readonly weakAreaService: WeakAreaService,
    private readonly quotaService: QuotaService
  ) {}

  @Get()
  async getWeakAreas(@CurrentUser('sub') userId: string) {
    this.logger.log(`GET /weak-areas - User: ${userId}`);
    return this.weakAreaService.getWeakAreas(userId, false);
  }

  @Get('resolved')
  async getResolvedWeakAreas(@CurrentUser('sub') userId: string) {
    this.logger.log(`GET /weak-areas/resolved - User: ${userId}`);
    return this.weakAreaService.getWeakAreas(userId, true);
  }

  @Get('stats')
  async getWeakAreaStats(@CurrentUser('sub') userId: string) {
    this.logger.log(`GET /weak-areas/stats - User: ${userId}`);
    return this.weakAreaService.getWeakAreaStats(userId);
  }

  @Post(':id/resolve')
  async resolveWeakArea(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    this.logger.log(`POST /weak-areas/${id}/resolve - User: ${userId}`);
    return this.weakAreaService.resolveWeakArea(userId, id);
  }

  @Post(':id/practice')
  @CheckQuota('weakAreaAnalysis')
  async generatePracticeQuiz(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    this.logger.log(`POST /weak-areas/${id}/practice - User: ${userId}`);

    const quiz = await this.weakAreaService.generatePracticeQuiz(userId, id);

    // Increment quota after successful generation
    await this.quotaService.incrementQuota(userId, 'weakAreaAnalysis');

    return quiz;
  }
}
