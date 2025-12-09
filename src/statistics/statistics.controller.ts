import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Statistics')
@Controller('statistics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get user statistics overview' })
  @ApiResponse({ status: 200, description: 'Statistics overview' })
  async getOverview(@CurrentUser('sub') userId: string) {
    return this.statisticsService.getOverview(userId);
  }

  @Get('attempts')
  @ApiOperation({ summary: 'Get user attempts with filters' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['quiz', 'flashcard', 'challenge'],
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of attempts with pagination' })
  async getAttempts(
    @CurrentUser('sub') userId: string,
    @Query('type') type?: 'quiz' | 'flashcard' | 'challenge',
    @Query('quizId') quizId?: string,
    @Query('flashcardSetId') flashcardSetId?: string,
    @Query('challengeId') challengeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number
  ) {
    return this.statisticsService.getAttempts(userId, {
      type,
      quizId,
      flashcardSetId,
      challengeId,
      startDate,
      endDate,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get performance by topic' })
  @ApiResponse({ status: 200, description: 'Performance statistics by topic' })
  async getPerformanceByTopic(@CurrentUser('sub') userId: string) {
    return this.statisticsService.getPerformanceByTopic(userId);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get activity heatmap data' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Activity data for heatmap' })
  async getActivityHeatmap(
    @CurrentUser('sub') userId: string,
    @Query('year') year?: number
  ) {
    return this.statisticsService.getActivityHeatmap(
      userId,
      year ? Number(year) : undefined
    );
  }
}
