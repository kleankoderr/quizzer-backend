import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanType, SubscriptionStatus } from '@prisma/client';
import { SubscriptionHelperService } from './subscription-helper.service';

export type QuotaFeature =
  | 'quiz'
  | 'flashcard'
  | 'studyMaterial'
  | 'conceptExplanation'
  | 'smartRecommendation'
  | 'smartCompanion'
  | 'fileUpload'
  | 'weakAreaAnalysis';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionHelper: SubscriptionHelperService
  ) {}

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

    // Check if monthly quota needs reset
    if (await this.shouldResetMonthlyQuota(userId, userQuota.monthlyResetAt)) {
      await this.resetMonthlyQuota(userId);
    }

    const currentUsage = this.getCurrentUsage(userQuota, feature);
    const limit = await this.getLimit(userId, feature);

    if (currentUsage >= limit) {
      // Check premium status from subscription (single source of truth)
      const isPremium = await this.subscriptionHelper.isPremiumUser(userId);
      const tierMessage = isPremium
        ? 'Try again next month.'
        : 'Upgrade to premium for higher limits.';
      throw new ForbiddenException(
        `Monthly ${feature} generation limit reached (${currentUsage}/${limit}). ${tierMessage}`
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
    if (await this.shouldResetMonthlyQuota(userId, userQuota.monthlyResetAt)) {
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

    // Get plan quotas from subscription or Free plan
    let planQuotas: any;
    if (hasActiveSubscription && subscription.plan.quotas) {
      planQuotas = subscription.plan.quotas;
    } else {
      // Fallback to Free plan from database
      const freePlan = await this.prisma.subscriptionPlan.findFirst({
        where: { name: 'Free', isActive: true },
      });
      if (!freePlan) {
        throw new Error('Free subscription plan not found in database');
      }
      planQuotas = freePlan.quotas;
    }

    const storageLimitMB = planQuotas?.storageLimitMB || 0;
    const filesPerMonth = planQuotas?.filesPerMonth || 0;

    const isPremium = await this.subscriptionHelper.isPremiumUser(userId);

    return {
      isPremium,
      monthlyResetAt: userQuota.monthlyResetAt,
      quiz: {
        used: userQuota.monthlyQuizCount,
        limit: planQuotas.quizzes || 0,
        remaining: Math.max(
          0,
          (planQuotas.quizzes || 0) - userQuota.monthlyQuizCount
        ),
      },
      flashcard: {
        used: userQuota.monthlyFlashcardCount,
        limit: planQuotas.flashcards || 0,
        remaining: Math.max(
          0,
          (planQuotas.flashcards || 0) - userQuota.monthlyFlashcardCount
        ),
      },
      studyMaterial: {
        used: userQuota.monthlyStudyMaterialCount,
        limit: planQuotas.studyMaterials || 0,
        remaining: Math.max(
          0,
          (planQuotas.studyMaterials || 0) - userQuota.monthlyStudyMaterialCount
        ),
      },
      conceptExplanation: {
        used: userQuota.monthlyConceptExplanationCount,
        limit: planQuotas.conceptExplanations || 0,
        remaining: Math.max(
          0,
          (planQuotas.conceptExplanations || 0) -
            userQuota.monthlyConceptExplanationCount
        ),
      },
      smartRecommendation: {
        used: userQuota.monthlySmartRecommendationCount,
        limit: planQuotas.smartRecommendations || 0,
        remaining: Math.max(
          0,
          (planQuotas.smartRecommendations || 0) -
            userQuota.monthlySmartRecommendationCount
        ),
      },
      smartCompanion: {
        used: userQuota.monthlySmartCompanionCount,
        limit: planQuotas.smartCompanions || 0,
        remaining: Math.max(
          0,
          (planQuotas.smartCompanions || 0) -
            userQuota.monthlySmartCompanionCount
        ),
      },
      weakAreaAnalysis: {
        used: userQuota.monthlyWeakAreaAnalysisCount,
        limit: planQuotas.weakAreaAnalysis || 0,
        remaining: Math.max(
          0,
          (planQuotas.weakAreaAnalysis || 0) -
            userQuota.monthlyWeakAreaAnalysisCount
        ),
      },
      fileUpload: {
        used: userQuota.monthlyFileUploadCount,
        limit: filesPerMonth,
        remaining: Math.max(
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

  private async shouldResetMonthlyQuota(
    userId: string,
    resetAt: Date
  ): Promise<boolean> {
    const now = new Date();
    const lastReset = new Date(resetAt);

    // Get user's subscription to check billing cycle
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // For free users, reset monthly
    if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
      // Reset on calendar month change
      return (
        now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear()
      );
    }

    // For premium users, reset based on subscription billing cycle
    return now >= subscription.currentPeriodEnd;
  }

  private async resetMonthlyQuota(userId: string): Promise<void> {
    this.logger.log(`Resetting monthly quota for user ${userId}`);

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Calculate next reset date
    let nextReset: Date;
    if (subscription?.status === SubscriptionStatus.ACTIVE) {
      // Use subscription period end for premium users
      nextReset = subscription.currentPeriodEnd;
    } else {
      // Use calendar month for free users
      nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      nextReset.setDate(1);
      nextReset.setHours(0, 0, 0, 0);
    }

    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        monthlyQuizCount: 0,
        monthlyFlashcardCount: 0,
        monthlyStudyMaterialCount: 0,
        monthlyConceptExplanationCount: 0,
        monthlySmartRecommendationCount: 0,
        monthlySmartCompanionCount: 0,
        monthlyWeakAreaAnalysisCount: 0,
        monthlyFileUploadCount: 0,
        monthlyResetAt: nextReset,
      },
    });

    this.logger.log(
      `Monthly quota reset for user ${userId}, next reset: ${nextReset.toISOString()}`
    );
  }

  private async incrementUsage(
    userId: string,
    feature: QuotaFeature
  ): Promise<void> {
    const fieldMap: Record<QuotaFeature, string> = {
      quiz: 'monthlyQuizCount',
      flashcard: 'monthlyFlashcardCount',
      studyMaterial: 'monthlyStudyMaterialCount',
      conceptExplanation: 'monthlyConceptExplanationCount',
      smartRecommendation: 'monthlySmartRecommendationCount',
      smartCompanion: 'monthlySmartCompanionCount',
      fileUpload: 'monthlyFileUploadCount',
      weakAreaAnalysis: 'monthlyWeakAreaAnalysisCount',
    };

    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        [fieldMap[feature]]: { increment: 1 },
      },
    });
  }

  private getCurrentUsage(userQuota: any, feature: QuotaFeature): number {
    const usageMap: Record<QuotaFeature, number> = {
      quiz: userQuota.monthlyQuizCount,
      flashcard: userQuota.monthlyFlashcardCount,
      studyMaterial: userQuota.monthlyStudyMaterialCount,
      conceptExplanation: userQuota.monthlyConceptExplanationCount,
      smartRecommendation: userQuota.monthlySmartRecommendationCount,
      smartCompanion: userQuota.monthlySmartCompanionCount,
      fileUpload: userQuota.monthlyFileUploadCount,
      weakAreaAnalysis: userQuota.monthlyWeakAreaAnalysisCount,
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

    // Map QuotaFeature to plan quota property names
    const featureMap: Record<QuotaFeature, string> = {
      quiz: 'quizzes',
      flashcard: 'flashcards',
      studyMaterial: 'studyMaterials',
      conceptExplanation: 'conceptExplanations',
      smartRecommendation: 'smartRecommendations',
      smartCompanion: 'smartCompanions',
      fileUpload: 'filesPerMonth',
      weakAreaAnalysis: 'weakAreaAnalysis',
    };

    const quotaKey = featureMap[feature];

    // If user has active subscription, use their plan quotas
    if (hasActiveSubscription && subscription.plan.quotas) {
      const planQuotas = subscription.plan.quotas as any;
      if (planQuotas[quotaKey] !== undefined) {
        return planQuotas[quotaKey];
      }
    }

    // Fallback to Free plan from database for non-subscribers
    const freePlan = await this.prisma.subscriptionPlan.findFirst({
      where: { name: 'Free', isActive: true },
    });

    if (!freePlan) {
      throw new Error('Free subscription plan not found in database');
    }

    const freePlanQuotas = freePlan.quotas as any;
    if (freePlanQuotas[quotaKey] === undefined) {
      throw new Error(
        `Quota '${quotaKey}' not found in Free plan for feature '${feature}'`
      );
    }

    return freePlanQuotas[quotaKey];
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

    // Get storage limit from plan quotas
    let storageLimitMB: number;
    if (hasActiveSubscription && subscription.plan.quotas) {
      storageLimitMB = (subscription.plan.quotas as any)?.storageLimitMB || 0;
    } else {
      // Fallback to Free plan from database
      const freePlan = await this.prisma.subscriptionPlan.findFirst({
        where: { name: 'Free', isActive: true },
      });
      if (!freePlan) {
        throw new Error('Free subscription plan not found in database');
      }
      storageLimitMB = (freePlan.quotas as any)?.storageLimitMB || 0;
    }

    const currentUsage = userQuota.totalFileStorageMB;

    // Strict enforcement for downgraded users:
    // If user is ALREADY over the limit (currentUsage > storageLimitMB), block upload
    // even if the new file is small. This forces cleanup after downgrade.
    if (currentUsage > storageLimitMB) {
      throw new ForbiddenException(
        `Your storage limit has been reduced. Please delete ${(
          currentUsage - storageLimitMB
        ).toFixed(2)}MB of files before uploading new ones.`
      );
    }

    const newTotal = currentUsage + fileSizeMB;

    if (newTotal > storageLimitMB) {
      const tierMessage = hasActiveSubscription
        ? 'Your storage is full. Please delete some files.'
        : 'Upgrade to premium for more storage.';
      throw new ForbiddenException(
        `File storage limit exceeded (${currentUsage.toFixed(
          2
        )}MB/${storageLimitMB}MB). ${tierMessage}`
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
   * Check if user is within storage limits
   * @param userId User ID
   * @returns True if usage is within limit
   */
  async enforceStorageLimit(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    // Determine storage limit based on subscription status
    let storageLimitMB = 50; // Default free tier

    if (
      subscription?.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date() &&
      subscription.plan.quotas
    ) {
      storageLimitMB = (subscription.plan.quotas as any).storageLimitMB || 50;
    } else {
      // Fallback to Free plan quotas if available
      const freePlan = await this.prisma.subscriptionPlan.findFirst({
        where: { name: PlanType.Free, isActive: true },
      });
      if (freePlan?.quotas) {
        storageLimitMB = (freePlan.quotas as any).storageLimitMB || 50;
      }
    }

    const userQuota = await this.prisma.userQuota.findUnique({
      where: { userId },
    });

    if (!userQuota) return true;

    return userQuota.totalFileStorageMB <= storageLimitMB;
  }

  /**
   * Get suggestions for files to delete to get back under storage limit
   * @param userId User ID
   */
  async getStorageCleanupSuggestions(userId: string) {
    const userQuota = await this.prisma.userQuota.findUnique({
      where: { userId },
    });

    if (!userQuota) {
      return { needsCleanup: false };
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    // Determine storage limit
    let limit = 50; // Default free tier
    if (
      subscription?.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date() &&
      subscription.plan.quotas
    ) {
      limit = (subscription.plan.quotas as any).storageLimitMB || 50;
    } else {
      const freePlan = await this.prisma.subscriptionPlan.findFirst({
        where: { name: PlanType.Free, isActive: true },
      });
      if (freePlan?.quotas) {
        limit = (freePlan.quotas as any).storageLimitMB || 50;
      }
    }

    const current = userQuota.totalFileStorageMB;

    if (current <= limit) {
      return { needsCleanup: false };
    }

    const needToDelete = current - limit;

    // Get user's largest files
    const largestFiles = await this.prisma.userDocument.findMany({
      where: { userId },
      include: { document: true },
      orderBy: { document: { sizeBytes: 'desc' } },
      take: 10,
    });

    return {
      needsCleanup: true,
      neededDeletion: needToDelete,
      currentUsage: current,
      limit,
      suggestions: largestFiles.map((uf) => ({
        id: uf.id,
        name: uf.displayName,
        sizeMB: (uf.document.sizeBytes / 1024 / 1024).toFixed(2),
        uploadedAt: uf.uploadedAt,
      })),
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

    // Only update subscription status
    // Quota checks will automatically use free tier quotas based on subscription
    await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.EXPIRED,
      },
    });
  }
}
