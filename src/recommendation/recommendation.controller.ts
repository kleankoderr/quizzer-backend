import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get()
  async getRecommendations(@CurrentUser('sub') userId: string) {
    return this.recommendationService.getRecommendations(userId);
  }

  @Patch(':id/dismiss')
  async dismissRecommendation(
    @CurrentUser('sub') userId: string,
    @Param('id') recommendationId: string
  ) {
    return this.recommendationService.dismissRecommendation(
      userId,
      recommendationId
    );
  }
}
