import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizProcessor } from './quiz.processor';
import { AiModule } from '../ai/ai.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { StreakModule } from '../streak/streak.module';
import { ChallengeModule } from '../challenge/challenge.module';
import { StudyModule } from '../study/study.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'quiz-generation',
    }),
    HttpModule,
    AiModule,
    RecommendationModule,
    StreakModule,
    ChallengeModule,
    StudyModule,
  ],
  controllers: [QuizController],
  providers: [QuizService, QuizProcessor],
  exports: [QuizService],
})
export class QuizModule {}
