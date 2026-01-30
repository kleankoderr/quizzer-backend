import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { ContentProcessor } from './content.processor';
import { ContentGenerationStrategy } from './strategies/content-generation.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { LangChainModule } from '../langchain/langchain.module';
import { QuizModule } from '../quiz/quiz.module';
import { FlashcardModule } from '../flashcard/flashcard.module';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { UserDocumentModule } from '../user-document/user-document.module';
import { StudyPackModule } from '../study-pack/study-pack.module';
import { InputPipelineModule } from '../input-pipeline/input-pipeline.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'content-generation' }),
    PrismaModule,
    LangChainModule,
    QuizModule,
    FlashcardModule,
    FileStorageModule,
    UserDocumentModule,
    StudyPackModule,
    InputPipelineModule,
  ],
  controllers: [ContentController],
  providers: [ContentService, ContentProcessor, ContentGenerationStrategy],
  exports: [ContentService],
})
export class ContentModule {}
