import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { QuizModule } from '../quiz/quiz.module';
import { FlashcardModule } from '../flashcard/flashcard.module';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [QuizModule, FlashcardModule, ContentModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
