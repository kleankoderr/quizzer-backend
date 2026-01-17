import { Module } from '@nestjs/common';
import { ChallengeController } from './challenge.controller';
import { ChallengeService } from './challenge.service';
import { ChallengeScheduler } from './challenge.scheduler';
import { LangChainModule } from '../langchain/langchain.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [LangChainModule, LeaderboardModule],
  controllers: [ChallengeController],
  providers: [ChallengeService, ChallengeScheduler],
  exports: [ChallengeService],
})
export class ChallengeModule {}
