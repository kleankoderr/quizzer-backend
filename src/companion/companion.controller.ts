import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Logger,
  Query,
} from '@nestjs/common';
import { CompanionService } from './companion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('companion')
@UseGuards(JwtAuthGuard)
export class CompanionController {
  private readonly logger = new Logger(CompanionController.name);

  constructor(private readonly companionService: CompanionService) {}

  @Get('messages')
  async getMessages(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /companion/messages - User: ${userId}`);
    return this.companionService.generateMessages(userId);
  }

  @Get('study-recommendations')
  async getStudyRecommendations(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /companion/study-recommendations - User: ${userId}`);
    return this.companionService.getStudySessionRecommendations(userId);
  }

  @Get('motivation')
  async getDailyMotivation(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /companion/motivation - User: ${userId}`);
    const motivation = await this.companionService.getDailyMotivation(userId);
    return { message: motivation };
  }

  @Get('statistics')
  async getStatistics(@Req() req: any, @Query('days') days?: string) {
    const userId = req.user.userId;
    const daysNum = days ? parseInt(days, 10) : 7;
    this.logger.log(
      `GET /companion/statistics?days=${daysNum} - User: ${userId}`
    );
    return this.companionService.getStudyStatistics(userId, daysNum);
  }

  @Post('track-session')
  async trackSession(
    @Req() req: any,
    @Body()
    body: {
      type: string;
      duration: number;
      itemsStudied: number;
      performance?: number;
    }
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `POST /companion/track-session - User: ${userId}, Type: ${body.type}`
    );
    return this.companionService.trackStudySession(
      userId,
      body.type,
      body.duration,
      body.itemsStudied,
      body.performance
    );
  }
}
