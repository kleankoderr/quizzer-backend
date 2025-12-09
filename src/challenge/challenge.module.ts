import { Module } from '@nestjs/common';
import ChallengeController from './challenge.controller';
import { ChallengeService } from './challenge.service';
import { ChallengeScheduler } from './challenge.scheduler';
import { AiModule } from '../ai/ai.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [AiModule, LeaderboardModule],
  controllers: [ChallengeController],
  providers: [ChallengeService, ChallengeScheduler],
  exports: [ChallengeService],
})
export class ChallengeModule {}
