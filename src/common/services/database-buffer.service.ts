import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export enum BufferResourceType {
  LEARNING_GUIDE = 'LEARNING_GUIDE',
  QUIZ = 'QUIZ',
  FLASHCARD = 'FLASHCARD',
}

interface BufferEntry {
  resourceId: string;
  type: BufferResourceType;
  data: any[]; // Array of items to be merged/appended
  lastUpdated: number;
}

@Injectable()
export class DatabaseBufferService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseBufferService.name);
  private readonly buffer = new Map<string, BufferEntry>();
  private readonly flushIntervalMs: number;
  private readonly maxItems: number;
  private readonly enabled: boolean;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {
    this.enabled = this.configService.get<boolean>('dbBuffer.enabled', true);
    this.flushIntervalMs = this.configService.get<number>(
      'dbBuffer.flushIntervalMs',
      5000
    );
    this.maxItems = this.configService.get<number>('dbBuffer.maxItems', 5);

    if (this.enabled) {
      this.startFlushTimer();
      this.logger.log(
        `Database Write Buffering enabled (Interval: ${this.flushIntervalMs}ms, Max Items: ${this.maxItems})`
      );
    } else {
      this.logger.log('Database Write Buffering is disabled');
    }
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    // Final flush on shutdown
    this.flushAll();
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushAll();
    }, this.flushIntervalMs);
  }

  /**
   * Add a section to the buffer for a learning guide
   */
  async addSection(contentId: string, sectionIndex: number, sectionData: any) {
    if (!this.enabled) {
      await this.directUpdateSection(contentId, sectionIndex, sectionData);
      return;
    }

    const key = `${BufferResourceType.LEARNING_GUIDE}:${contentId}`;
    this.addToBuffer(key, BufferResourceType.LEARNING_GUIDE, contentId, {
      index: sectionIndex,
      ...sectionData,
    });
  }

  /**
   * Add questions to the buffer for a quiz
   */
  async addQuizQuestions(quizId: string, questions: any[]) {
    if (!this.enabled) {
      await this.directUpdateQuiz(quizId, questions);
      return;
    }

    const key = `${BufferResourceType.QUIZ}:${quizId}`;
    this.addToBuffer(key, BufferResourceType.QUIZ, quizId, questions);
  }

  /**
   * Add cards to the buffer for a flashcard set
   */
  async addFlashcards(setId: string, cards: any[]) {
    if (!this.enabled) {
      await this.directUpdateFlashcards(setId, cards);
      return;
    }

    const key = `${BufferResourceType.FLASHCARD}:${setId}`;
    this.addToBuffer(key, BufferResourceType.FLASHCARD, setId, cards);
  }

  private addToBuffer(
    key: string,
    type: BufferResourceType,
    resourceId: string,
    item: any
  ) {
    let entry = this.buffer.get(key);
    if (!entry) {
      entry = {
        resourceId,
        type,
        data: [],
        lastUpdated: Date.now(),
      };
      this.buffer.set(key, entry);
    }

    if (Array.isArray(item)) {
      entry.data.push(...item);
    } else {
      entry.data.push(item);
    }

    entry.lastUpdated = Date.now();

    if (entry.data.length >= this.maxItems) {
      this.flushResource(key);
    }
  }

  /**
   * Force flush all buffers
   */
  async flushAll() {
    const keys = Array.from(this.buffer.keys());
    for (const key of keys) {
      await this.flushResource(key);
    }
  }

  /**
   * Force flush a specific resource
   */
  async flush(type: BufferResourceType, resourceId: string) {
    const key = `${type}:${resourceId}`;
    await this.flushResource(key);
  }

  private async flushResource(key: string) {
    const entry = this.buffer.get(key);
    if (!entry || entry.data.length === 0) {
      this.buffer.delete(key);
      return;
    }

    // Remove from buffer immediately to prevent duplicate flushes if one is slow
    this.buffer.delete(key);

    try {
      this.logger.debug(
        `Flushing buffer for ${key} (${entry.data.length} items)`
      );

      switch (entry.type) {
        case BufferResourceType.LEARNING_GUIDE:
          await this.performLearningGuideFlush(entry.resourceId, entry.data);
          break;
        case BufferResourceType.QUIZ:
          await this.performQuizFlush(entry.resourceId, entry.data);
          break;
        case BufferResourceType.FLASHCARD:
          await this.performFlashcardFlush(entry.resourceId, entry.data);
          break;
      }
    } catch (error) {
      this.logger.error(
        `Failed to flush buffer for ${key}: ${error.message}`,
        error.stack
      );
      // Optional: Re-add to buffer or handle failure?
      // For now, we risk data loss on serious DB errors, but re-adding might cause infinite loops.
    }
  }

  private async performLearningGuideFlush(contentId: string, updates: any[]) {
    await this.prisma.$transaction(async (tx) => {
      const content = await tx.content.findUnique({
        where: { id: contentId },
        select: { learningGuide: true },
      });

      if (!content?.learningGuide) return;

      const learningGuide = content.learningGuide as any;
      const sections = learningGuide.sections || [];

      for (const update of updates) {
        const { index, ...data } = update;
        sections[index] = {
          ...sections[index],
          ...data,
        };
      }

      await tx.content.update({
        where: { id: contentId },
        data: {
          learningGuide: {
            ...learningGuide,
            sections,
          },
        },
      });
    });
  }

  private async performQuizFlush(quizId: string, newQuestions: any[]) {
    await this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.findUnique({
        where: { id: quizId },
        select: { questions: true },
      });

      if (!quiz) return;

      const questions = [...(quiz.questions as any[]), ...newQuestions];

      await tx.quiz.update({
        where: { id: quizId },
        data: { questions },
      });
    });
  }

  private async performFlashcardFlush(setId: string, newCards: any[]) {
    await this.prisma.$transaction(async (tx) => {
      const set = await tx.flashcardSet.findUnique({
        where: { id: setId },
        select: { cards: true },
      });

      if (!set) return;

      const cards = [...(set.cards as any[]), ...newCards];

      await tx.flashcardSet.update({
        where: { id: setId },
        data: { cards },
      });
    });
  }

  // --- Direct updates for when buffering is disabled ---

  private async directUpdateSection(
    contentId: string,
    index: number,
    data: any
  ) {
    return this.performLearningGuideFlush(contentId, [{ index, ...data }]);
  }

  private async directUpdateQuiz(quizId: string, questions: any[]) {
    return this.performQuizFlush(quizId, questions);
  }

  private async directUpdateFlashcards(setId: string, cards: any[]) {
    return this.performFlashcardFlush(setId, cards);
  }
}
