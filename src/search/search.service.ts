import { Injectable } from '@nestjs/common';
import { QuizService } from '../quiz/quiz.service';
import { FlashcardService } from '../flashcard/flashcard.service';
import { ContentService } from '../content/content.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly quizService: QuizService,
    private readonly flashcardService: FlashcardService,
    private readonly contentService: ContentService
  ) {}

  async search(userId: string, query: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const [quizzes, flashcards, content] = await Promise.all([
      this.quizService.searchQuizzes(userId, query),
      this.flashcardService.searchFlashcardSets(userId, query),
      this.contentService.searchContent(userId, query),
    ]);

    return [...quizzes, ...flashcards, ...content];
  }
}
