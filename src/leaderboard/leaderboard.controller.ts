import { Controller, Get, UseGuards } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('global')
  async getGlobalLeaderboard(@CurrentUser('sub') userId: string) {
    return this.leaderboardService.getGlobalLeaderboard(userId);
  }

  @Get('friends')
  async getFriendsLeaderboard(@CurrentUser('sub') userId: string) {
    return this.leaderboardService.getSchoolLeaderboard(userId);
  }
}
