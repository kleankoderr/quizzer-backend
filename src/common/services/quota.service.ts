import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

export type QuotaFeature =
  | 'quiz'
  | 'flashcard'
  | 'learningGuide'
  | 'explanation'
  | 'fileUpload';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  // Free tier limits (configurable via environment variables)
  private readonly FREE_TIER_LIMITS: Record<QuotaFeature, number>;

  // Premium tier limits (configurable via environment variables)
  private readonly PREMIUM_TIER_LIMITS: Record<QuotaFeature, number>;

  // File storage limits (in MB)
  private readonly FREE_TIER_STORAGE_LIMIT: number;
  private readonly PREMIUM_TIER_STORAGE_LIMIT: number;

  // Monthly file upload limits
  private readonly FREE_TIER_FILES_PER_MONTH: number;
  private readonly PREMIUM_TIER_FILES_PER_MONTH: number;

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
      fileUpload: this.configService.get<number>('QUOTA_FREE_FILE_UPLOAD', 5),
    };

    this.FREE_TIER_STORAGE_LIMIT = this.configService.get<number>(
      'QUOTA_FREE_STORAGE_MB',
      50
    );
    this.FREE_TIER_FILES_PER_MONTH = this.configService.get<number>(
      'QUOTA_FREE_FILES_PER_MONTH',
      5
    );

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
      fileUpload: this.configService.get<number>(
        'QUOTA_PREMIUM_FILE_UPLOAD',
        100
      ),
    };

    this.PREMIUM_TIER_STORAGE_LIMIT = this.configService.get<number>(
      'QUOTA_PREMIUM_STORAGE_MB',
      1000
    );
    this.PREMIUM_TIER_FILES_PER_MONTH = this.configService.get<number>(
      'QUOTA_PREMIUM_FILES_PER_MONTH',
      100
    );
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
      const limit = await this.getLimit(userId, feature);
      return { allowed: true, remaining: limit };
    }

    // Check if monthly quota needs reset
    if (this.shouldResetMonthlyQuota(userQuota.monthlyResetAt)) {
      await this.resetMonthlyQuota(userId);
    }

    const currentUsage = this.getCurrentUsage(userQuota, feature);
    const limit = await this.getLimit(userId, feature);

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

    // Check if monthly quota needs reset
    if (this.shouldResetMonthlyQuota(userQuota.monthlyResetAt)) {
      await this.resetMonthlyQuota(userId);
      userQuota = await this.prisma.userQuota.findUnique({
        where: { userId },
      });
    }

    // Get limits from active subscription or fallback to free tier
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const hasActiveSubscription =
      subscription?.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date();

    const limits = hasActiveSubscription
      ? this.PREMIUM_TIER_LIMITS
      : this.FREE_TIER_LIMITS;

    const storageLimitMB = hasActiveSubscription
      ? (subscription.plan.quotas as any)?.storageLimitMB ||
        this.PREMIUM_TIER_STORAGE_LIMIT
      : this.FREE_TIER_STORAGE_LIMIT;

    const filesPerMonth = hasActiveSubscription
      ? (subscription.plan.quotas as any)?.filesPerMonth ||
        this.PREMIUM_TIER_FILES_PER_MONTH
      : this.FREE_TIER_FILES_PER_MONTH;

    return {
      isPremium: hasActiveSubscription, // Only check active subscription, not stale userQuota.isPremium
      resetAt: userQuota.quotaResetAt,
      monthlyResetAt: userQuota.monthlyResetAt,
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
      fileUpload: {
        dailyUsed: userQuota.dailyFileUploadCount,
        dailyLimit: limits.fileUpload,
        dailyRemaining: Math.max(
          0,
          limits.fileUpload - userQuota.dailyFileUploadCount
        ),
        monthlyUsed: userQuota.monthlyFileUploadCount,
        monthlyLimit: filesPerMonth,
        monthlyRemaining: Math.max(
          0,
          filesPerMonth - userQuota.monthlyFileUploadCount
        ),
      },
      fileStorage: {
        used: Math.ceil(userQuota.totalFileStorageMB),
        limit: storageLimitMB,
        remaining: Math.max(
          0,
          storageLimitMB - Math.ceil(userQuota.totalFileStorageMB)
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
        dailyFileUploadCount: 0,
        quotaResetAt: new Date(),
      },
    });
  }

  private shouldResetMonthlyQuota(resetAt: Date): boolean {
    const now = new Date();
    const lastReset = new Date(resetAt);

    // Reset if it's a new month
    return (
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    );
  }

  private async resetMonthlyQuota(userId: string): Promise<void> {
    this.logger.log(`Resetting monthly quota for user ${userId}`);
    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        monthlyTotalCount: 0,
        monthlyFileUploadCount: 0,
        monthlyResetAt: new Date(),
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
      fileUpload: 'dailyFileUploadCount',
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
      fileUpload: userQuota.dailyFileUploadCount,
    };
    return usageMap[feature];
  }

  /**
   * Get quota limit for a feature based on user's active subscription
   * @param userId User ID
   * @param feature Quota feature
   * @returns Quota limit
   */
  private async getLimit(
    userId: string,
    feature: QuotaFeature
  ): Promise<number> {
    // Check for active subscription
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const hasActiveSubscription =
      subscription?.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date();

    if (hasActiveSubscription && subscription.plan.quotas) {
      // Map QuotaFeature to plan quota property names
      const planQuotas = subscription.plan.quotas as any;
      const featureMap: Record<QuotaFeature, string> = {
        quiz: 'quizzes',
        flashcard: 'flashcards',
        learningGuide: 'learningGuides',
        explanation: 'explanations',
        fileUpload: 'filesPerMonth',
      };

      const quotaKey = featureMap[feature];
      if (planQuotas[quotaKey] !== undefined) {
        return planQuotas[quotaKey];
      }
    }

    // Fallback to free tier limits
    return this.FREE_TIER_LIMITS[feature];
  }

  /**
   * Check if file storage limit allows upload
   * @param userId User ID
   * @param fileSizeMB File size in MB
   * @returns Upload permission details
   */
  async checkFileStorageLimit(
    userId: string,
    fileSizeMB: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    current: number;
    limit: number;
  }> {
    // Get user quota
    let userQuota = await this.prisma.userQuota.findUnique({
      where: { userId },
    });

    if (!userQuota) {
      userQuota = await this.prisma.userQuota.create({
        data: { userId },
      });
    }

    // Get storage limit from subscription or free tier
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const hasActiveSubscription =
      subscription?.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date();

    const storageLimitMB = hasActiveSubscription
      ? (subscription.plan.quotas as any)?.storageLimitMB ||
        this.PREMIUM_TIER_STORAGE_LIMIT
      : this.FREE_TIER_STORAGE_LIMIT;

    const currentUsage = userQuota.totalFileStorageMB;
    const newTotal = currentUsage + fileSizeMB;

    if (newTotal > storageLimitMB) {
      const tierMessage = hasActiveSubscription
        ? 'Your storage is full. Please delete some files.'
        : 'Upgrade to premium for more storage.';
      throw new ForbiddenException(
        `File storage limit exceeded (${currentUsage.toFixed(2)}MB/${storageLimitMB}MB). ${tierMessage}`
      );
    }

    return {
      allowed: true,
      remaining: storageLimitMB - newTotal,
      current: currentUsage,
      limit: storageLimitMB,
    };
  }

  /**
   * Increment file upload counters after successful upload
   * @param userId User ID
   * @param fileSizeMB File size in MB
   */
  async incrementFileUpload(userId: string, fileSizeMB: number): Promise<void> {
    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        dailyFileUploadCount: { increment: 1 },
        monthlyFileUploadCount: { increment: 1 },
        totalFileStorageMB: { increment: fileSizeMB },
      },
    });

    this.logger.log(
      `Incremented file upload quota for user ${userId}: +${fileSizeMB}MB`
    );
  }

  /**
   * Reset user quota to free tier (called when subscription expires)
   * @param userId User ID
   */
  async resetToFreeTier(userId: string): Promise<void> {
    this.logger.log(`Resetting user ${userId} to free tier`);
    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        isPremium: false,
      },
    });
  }
}
