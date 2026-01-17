import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizProcessor } from './quiz.processor';
import { LangChainModule } from '../langchain/langchain.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { StreakModule } from '../streak/streak.module';
import { ChallengeModule } from '../challenge/challenge.module';
import { StudyModule } from '../study/study.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { UserDocumentModule } from '../user-document/user-document.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StudyPackModule } from '../study-pack/study-pack.module';
import { QuizGenerationStrategy } from './strategies/quiz-generation.strategy';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'quiz-generation',
    }),
    PrismaModule,
    LangChainModule,
    RagModule,
    RecommendationModule,
    StreakModule,
    ChallengeModule,
    StudyModule,
    FileStorageModule,
    UserDocumentModule,
    StudyPackModule,
  ],
  controllers: [QuizController],
  providers: [QuizService, QuizProcessor, QuizGenerationStrategy],
  exports: [QuizService],
})
export class QuizModule {}
