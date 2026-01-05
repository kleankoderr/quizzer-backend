import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { ContentProcessor } from './content.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { QuizModule } from '../quiz/quiz.module';
import { FlashcardModule } from '../flashcard/flashcard.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { UserDocumentModule } from '../user-document/user-document.module';
import { StudyPackModule } from '../study-pack/study-pack.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'content-generation' },
      { name: 'summary-generation' }
    ),
    PrismaModule,
    AiModule,
    QuizModule,
    FlashcardModule,
    FileStorageModule,
    UserDocumentModule,
    StudyPackModule,
  ],
  controllers: [ContentController],
  providers: [ContentService, ContentProcessor],
  exports: [ContentService],
})
export class ContentModule {}
