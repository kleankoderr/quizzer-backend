import { Controller, Get, Post, UseGuards, Req, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StreakService } from './streak.service';

@Controller('streak')
@UseGuards(JwtAuthGuard)
export class StreakController {
  constructor(private readonly streakService: StreakService) {}

  @Get()
  async getCurrentStreak(@Req() req) {
    return this.streakService.getCurrentStreak(req.user.id);
  }

  @Post('update')
  async updateStreak(
    @Req() req,
    @Body() body: { score?: number; totalQuestions?: number }
  ) {
    return this.streakService.updateStreak(
      req.user.id,
      body.score,
      body.totalQuestions
    );
  }
}
