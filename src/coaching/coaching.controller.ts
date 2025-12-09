import { Controller, Get, UseGuards } from '@nestjs/common';
import { CoachingService } from './coaching.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('coaching')
@UseGuards(JwtAuthGuard)
export class CoachingController {
  constructor(private readonly coachingService: CoachingService) {}

  @Get('tips')
  async getTips(@CurrentUser('sub') userId: string) {
    return this.coachingService.getCoachingTips(userId);
  }
}
