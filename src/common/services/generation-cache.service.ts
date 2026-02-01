import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from './cache.service';

export type GenerationType = 'content' | 'quiz' | 'flashcard';

export interface CacheCheckResult {
  jobId: string;
  recordId?: string;
  status: 'completed' | 'pending';
  cached: boolean;
}

@Injectable()
export class GenerationCacheService {
  private readonly logger = new Logger(GenerationCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService
  ) {}

  /**
   * Checks both Tier 2 (Redis) and Tier 1 (Database) for existing generation jobs or completed records.
   * Prioritizes Tier 2 to ensure we latch onto in-progress jobs.
   */
  async checkCaches(
    type: GenerationType,
    hash: string,
    context: { userId: string; studyPackId?: string; contentId?: string }
  ): Promise<CacheCheckResult | null> {
    const { userId, studyPackId, contentId } = context;

    // 1. Check In-Progress Jobs (Tier 2: Pending) -> User Scoped
    const pendingJobKey = `pending-job:${type}:${userId}:${hash}`;
    const pendingJob = await this.cacheService.get<{
      jobId: string;
      recordId?: string;
    }>(pendingJobKey);

    if (pendingJob) {
      this.logger.log(
        `[${type}] User PENDING job found for hash ${hash}. Reusing jobId ${pendingJob.jobId}`
      );
      return {
        jobId: pendingJob.jobId,
        status: 'pending',
        cached: false, // It is not "cached" in the sense of completed, but it is an active job
      };
    }

    // 2. Check DB (Tier 1: Completed)
    switch (type) {
      case 'content':
        return this.checkContentCache(hash, userId, studyPackId);
      case 'quiz':
        return this.checkQuizCache(hash, userId, studyPackId, contentId);
      case 'flashcard':
        return this.checkFlashcardCache(hash, userId, studyPackId, contentId);
      default:
        return null;
    }
  }

  private async checkContentCache(
    hash: string,
    userId: string,
    studyPackId?: string
  ): Promise<CacheCheckResult | null> {
    const existing = await this.prisma.content.findFirst({
      where: { contentHash: hash, learningGuide: { not: null } },
      select: {
        id: true,
        title: true,
        topic: true,
        content: true,
        description: true,
        learningGuide: true,
        userId: true,
      },
    });

    if (existing) {
      const lg = existing.learningGuide as any;
      const isComplete = lg?.sections?.some(
        (s: any, idx: number) => idx > 0 && s.content && s.content.length > 50
      );

      if (isComplete) {
        // Case B: Content Exists and Is Completed (Same User)
        if (existing.userId === userId) {
          this.logger.log(
            `[content] User match found for hash ${hash}. Returning existing record ${existing.id}`
          );
          return {
            jobId: 'CACHED',
            recordId: existing.id,
            status: 'completed',
            cached: true,
          };
        }

        // Case A: Content Exists and Is Completed (Different User) -> Clone it
        this.logger.log(
          `[content] Global match found for hash ${hash}. Cloning content for user ${userId}`
        );
        const cloned = await this.prisma.content.create({
          data: {
            title: existing.title,
            topic: existing.topic,
            content: existing.content,
            description: existing.description,
            learningGuide: existing.learningGuide as any,
            userId,
            studyPackId,
            contentHash: hash,
          },
        });
        return {
          jobId: 'CACHED',
          recordId: cloned.id,
          status: 'completed',
          cached: true,
        };
      }
    }
    return null;
  }

  private async checkQuizCache(
    hash: string,
    userId: string,
    studyPackId?: string,
    contentId?: string
  ): Promise<CacheCheckResult | null> {
    const existing = await this.prisma.quiz.findFirst({
      where: { contentHash: hash, questions: { not: [] as any } },
      select: {
        title: true,
        topic: true,
        difficulty: true,
        questions: true,
        quizType: true,
        timeLimit: true,
        totalQuestionsRequested: true,
        tags: true,
      },
    });

    if (existing) {
      const questions = (existing.questions as any[]) || [];
      const requested = existing.totalQuestionsRequested || 10;

      if (questions.length >= requested * 0.8) {
        this.logger.log(`[quiz] Global DB match found for hash ${hash}`);
        const cloned = await this.prisma.quiz.create({
          data: {
            ...existing,
            userId,
            studyPackId,
            contentId,
            contentHash: hash,
          },
        });
        return {
          jobId: 'CACHED',
          recordId: cloned.id,
          status: 'completed',
          cached: true,
        };
      }
    }
    return null;
  }

  private async checkFlashcardCache(
    hash: string,
    userId: string,
    studyPackId?: string,
    contentId?: string
  ): Promise<CacheCheckResult | null> {
    const existing = await this.prisma.flashcardSet.findFirst({
      where: { contentHash: hash, cards: { not: [] as any } },
      select: {
        title: true,
        topic: true,
        cards: true,
        totalCardsRequested: true,
      },
    });

    if (existing) {
      const cards = (existing.cards as any[]) || [];
      const requested = existing.totalCardsRequested || 10;

      if (cards.length >= requested * 0.8) {
        this.logger.log(`[flashcard] Global DB match found for hash ${hash}`);
        const cloned = await this.prisma.flashcardSet.create({
          data: {
            ...existing,
            userId,
            studyPackId,
            contentId,
            contentHash: hash,
          },
        });
        return {
          jobId: 'CACHED',
          recordId: cloned.id,
          status: 'completed',
          cached: true,
        };
      }
    }
    return null;
  }
}
