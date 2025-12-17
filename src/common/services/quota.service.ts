import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export type QuotaFeature =
  | 'quiz'
  | 'flashcard'
  | 'learningGuide'
  | 'explanation';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  // Free tier limits (configurable via environment variables)
  private readonly FREE_TIER_LIMITS: Record<QuotaFeature, number>;

  // Premium tier limits (configurable via environment variables)
  private readonly PREMIUM_TIER_LIMITS: Record<QuotaFeature, number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {
    // Initialize free tier limits with env vars or defaults
    this.FREE_TIER_LIMITS = {
      quiz: this.configService.get<number>('QUOTA_FREE_QUIZ', 2),
      flashcard: this.configService.get<number>('QUOTA_FREE_FLASHCARD', 2),
      learningGuide: this.configService.get<number>(
        'QUOTA_FREE_LEARNING_GUIDE',
        1
      ),
      explanation: this.configService.get<number>('QUOTA_FREE_EXPLANATION', 5),
    };

    // Initialize premium tier limits with env vars or defaults
    this.PREMIUM_TIER_LIMITS = {
      quiz: this.configService.get<number>('QUOTA_PREMIUM_QUIZ', 15),
      flashcard: this.configService.get<number>('QUOTA_PREMIUM_FLASHCARD', 15),
      learningGuide: this.configService.get<number>(
        'QUOTA_PREMIUM_LEARNING_GUIDE',
        10
      ),
      explanation: this.configService.get<number>(
        'QUOTA_PREMIUM_EXPLANATION',
        20
      ),
    };
  }

  /**
   * Check if user has quota available for feature
   * Throws ForbiddenException if quota exceeded
   */
  async checkQuota(
    userId: string,
    feature: QuotaFeature
  ): Promise<{ allowed: true; remaining: number }> {
    let userQuota = await this.prisma.userQuota.findUnique({
      where: { userId },
    });

    if (!userQuota) {
      userQuota = await this.prisma.userQuota.create({
        data: { userId },
      });
    }

    if (this.shouldResetQuota(userQuota.quotaResetAt)) {
      await this.resetDailyQuota(userId);
      const limit = this.getLimit(userQuota.isPremium, feature);
      return { allowed: true, remaining: limit };
    }

    const currentUsage = this.getCurrentUsage(userQuota, feature);
    const limit = this.getLimit(userQuota.isPremium, feature);

    if (currentUsage >= limit) {
      const tierMessage = userQuota.isPremium
        ? 'Try again tomorrow.'
        : 'Upgrade to premium for higher limits.';
      throw new ForbiddenException(
        `Daily ${feature} generation limit reached (${limit}/${limit}). ${tierMessage}`
      );
    }

    return { allowed: true, remaining: limit - currentUsage };
  }

  async incrementQuota(userId: string, feature: QuotaFeature): Promise<void> {
    await this.incrementUsage(userId, feature);
    this.logger.log(`Incremented ${feature} quota for user ${userId}`);
  }

  /**
   * Get current quota status without incrementing
   */
  async getQuotaStatus(userId: string) {
    // Get or create user quota record
    let userQuota = await this.prisma.userQuota.findUnique({
      where: { userId },
    });

    // Create quota record if it doesn't exist
    if (!userQuota) {
      userQuota = await this.prisma.userQuota.create({
        data: { userId },
      });
    }

    const limits = userQuota.isPremium
      ? this.PREMIUM_TIER_LIMITS
      : this.FREE_TIER_LIMITS;

    return {
      isPremium: userQuota.isPremium,
      resetAt: userQuota.quotaResetAt,
      quiz: {
        used: userQuota.dailyQuizCount,
        limit: limits.quiz,
        remaining: Math.max(0, limits.quiz - userQuota.dailyQuizCount),
      },
      flashcard: {
        used: userQuota.dailyFlashcardCount,
        limit: limits.flashcard,
        remaining: Math.max(
          0,
          limits.flashcard - userQuota.dailyFlashcardCount
        ),
      },
      learningGuide: {
        used: userQuota.dailyLearningGuideCount,
        limit: limits.learningGuide,
        remaining: Math.max(
          0,
          limits.learningGuide - userQuota.dailyLearningGuideCount
        ),
      },
      explanation: {
        used: userQuota.dailyExplanationCount,
        limit: limits.explanation,
        remaining: Math.max(
          0,
          limits.explanation - userQuota.dailyExplanationCount
        ),
      },
    };
  }

  private shouldResetQuota(resetAt: Date): boolean {
    const now = new Date();
    const lastReset = new Date(resetAt);

    // Reset if it's a new day
    return (
      now.getDate() !== lastReset.getDate() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    );
  }

  private async resetDailyQuota(userId: string): Promise<void> {
    this.logger.log(`Resetting daily quota for user ${userId}`);
    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        dailyQuizCount: 0,
        dailyFlashcardCount: 0,
        dailyLearningGuideCount: 0,
        dailyExplanationCount: 0,
        quotaResetAt: new Date(),
      },
    });
  }

  private async incrementUsage(
    userId: string,
    feature: QuotaFeature
  ): Promise<void> {
    const fieldMap: Record<QuotaFeature, string> = {
      quiz: 'dailyQuizCount',
      flashcard: 'dailyFlashcardCount',
      learningGuide: 'dailyLearningGuideCount',
      explanation: 'dailyExplanationCount',
    };

    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        [fieldMap[feature]]: { increment: 1 },
        monthlyTotalCount: { increment: 1 },
      },
    });
  }

  private getCurrentUsage(userQuota: any, feature: QuotaFeature): number {
    const usageMap: Record<QuotaFeature, number> = {
      quiz: userQuota.dailyQuizCount,
      flashcard: userQuota.dailyFlashcardCount,
      learningGuide: userQuota.dailyLearningGuideCount,
      explanation: userQuota.dailyExplanationCount,
    };
    return usageMap[feature];
  }

  private getLimit(isPremium: boolean, feature: QuotaFeature): number {
    const limits = isPremium ? this.PREMIUM_TIER_LIMITS : this.FREE_TIER_LIMITS;
    return limits[feature];
  }
}
