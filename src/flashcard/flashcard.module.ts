import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FlashcardController } from './flashcard.controller';
import { FlashcardService } from './flashcard.service';
import { FlashcardProcessor } from './flashcard.processor';
import { AiModule } from '../ai/ai.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { StreakModule } from '../streak/streak.module';
import { ChallengeModule } from '../challenge/challenge.module';
import { StudyModule } from '../study/study.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { UserDocumentModule } from '../user-document/user-document.module';
import { PrismaModule } from '../prisma/prisma.module'; // Assuming PrismaModule needs to be imported if used
import { StudyPackModule } from '../study-pack/study-pack.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'flashcard-generation',
    }),
    PrismaModule, // Added PrismaModule
    AiModule,
    RecommendationModule,
    StreakModule,
    ChallengeModule,
    StudyModule,
    FileStorageModule, // Added FileStorageModule
    UserDocumentModule, // Added UserDocumentModule
    StudyPackModule,
  ],
  controllers: [FlashcardController],
  providers: [FlashcardService, FlashcardProcessor],
  exports: [FlashcardService],
})
export class FlashcardModule {}
