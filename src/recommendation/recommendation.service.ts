import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { QuotaService } from '../common/services/quota.service';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly quotaService: QuotaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  /**
   * Return recommendations already stored in the database for a user.
   * This is intentionally read-only and does NOT call the AI.
   * Returns 3 recommendations for premium users, 1 for free users.
   * Only returns visible recommendations (not dismissed by user).
   */
  async getRecommendations(userId: string) {
    this.logger.debug(`Fetching recommendations for user ${userId}`);

    const cacheKey = `recommendations:${userId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for recommendations, user ${userId}`);
      return cached;
    }

    // Get user's quota status to determine premium tier
    const quotaStatus = await this.quotaService.getQuotaStatus(userId);
    const isPremium = quotaStatus.isPremium;
    const limit = isPremium ? 3 : 1;

    const stored = await this.prisma.recommendation.findMany({
      where: { userId, visible: true }, // Only fetch visible recommendations
      orderBy: { priority: 'asc' },
      take: limit,
    });

    if (!stored || stored.length === 0) {
      this.logger.debug(
        `No recommendations found for user ${userId}, returning defaults`
      );
      // Return sensible defaults for new users
      const defaults = [
        {
          topic: 'General Knowledge',
          reason: 'Great starting point for new learners',
          priority: 'high' as const,
        },
        {
          topic: 'Science Basics',
          reason: 'Build fundamental knowledge',
          priority: 'medium' as const,
        },
        {
          topic: 'History',
          reason: 'Explore historical events',
          priority: 'low' as const,
        },
      ];
      return defaults.slice(0, limit);
    }

    this.logger.log(
      `Returning ${stored.length} recommendations for user ${userId} (${isPremium ? 'premium' : 'free'} tier)`
    );
    const result = stored.map((s) => ({
      id: s.id,
      topic: s.topic,
      reason: s.reason,
      priority: s.priority,
      visible: s.visible,
    }));

    // Cache recommendations for 10 minutes
    await this.cacheManager.set(cacheKey, result, 600000);

    return result;
  }

  /**
   * Dismiss a recommendation by setting visible to false
   */
  async dismissRecommendation(userId: string, recommendationId: string) {
    this.logger.log(
      `Dismissing recommendation ${recommendationId} for user ${userId}`
    );

    const recommendation = await this.prisma.recommendation.findFirst({
      where: { id: recommendationId, userId },
    });

    if (!recommendation) {
      this.logger.warn(
        `Recommendation ${recommendationId} not found for user ${userId}`
      );
      return { success: false, message: 'Recommendation not found' };
    }

    await this.prisma.recommendation.update({
      where: { id: recommendationId },
      data: { visible: false },
    });

    // Invalidate cache after dismissing
    await this.cacheManager.del(`recommendations:${userId}`);

    this.logger.log(
      `Successfully dismissed recommendation ${recommendationId} for user ${userId}`
    );
    return { success: true, message: 'Recommendation dismissed' };
  }

  /**
   * Analyze recent attempts for the user, generate recommendations using the AI,
   * and persist them to the database. This should be called after an attempt is
   * recorded (quiz or flashcard) rather than on every app load.
   *
   * SMART BEHAVIOR:
   * - Only generates after every 3rd attempt (not every single one)
   * - Requires latest score < 70% (stricter than before)
   * - 24-hour cooldown between generations
   */
  async generateAndStoreRecommendations(userId: string) {
    this.logger.log(
      `Checking if recommendations should be generated for user ${userId}`
    );

    // Get user's recent attempts
    const attempts = await this.prisma.attempt.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 20,
      include: {
        quiz: {
          select: { topic: true },
        },
      },
    });

    if (attempts.length === 0) {
      this.logger.debug(
        `No attempts found for user ${userId}, skipping recommendation generation`
      );
      return [];
    }

    // Check cooldown: Don't generate if we generated in the last 24 hours
    const latestRecommendation = await this.prisma.recommendation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    if (latestRecommendation) {
      const hoursSinceLastGeneration =
        (Date.now() - latestRecommendation.updatedAt.getTime()) /
        (1000 * 60 * 60);

      if (hoursSinceLastGeneration < 24) {
        this.logger.debug(
          `Skipping recommendations: Generated ${hoursSinceLastGeneration.toFixed(1)}h ago (cooldown: 24h)`
        );
        return [];
      }
    }

    // Check if latest attempt performance warrants new recommendations
    const latestAttempt = attempts[0];
    if (
      latestAttempt &&
      latestAttempt.score != null &&
      latestAttempt.totalQuestions
    ) {
      const latestPercentage =
        (latestAttempt.score / latestAttempt.totalQuestions) * 100;

      // Only generate if score is below 70% (stricter threshold)
      if (latestPercentage >= 70) {
        this.logger.debug(
          `Latest attempt score (${latestPercentage.toFixed(1)}%) is good (>= 70%). Skipping recommendations.`
        );
        return [];
      }
    }

    // Check attempt frequency: Only generate after every 3rd quiz attempt
    const quizAttempts = await this.prisma.attempt.count({
      where: {
        userId,
        type: 'quiz',
      },
    });

    if (quizAttempts % 3 !== 0) {
      this.logger.debug(
        `Attempt count (${quizAttempts}) not at 3-attempt interval. Skipping recommendations.`
      );
      return [];
    }

    // Analyze weak topics
    const weakTopics: string[] = [];
    const topicScores = new Map<string, { total: number; count: number }>();

    for (const attempt of attempts) {
      if (attempt.quiz && attempt.score != null && attempt.totalQuestions) {
        const topic = attempt.quiz.topic;
        const percentage = (attempt.score / attempt.totalQuestions) * 100;

        if (!topicScores.has(topic)) {
          topicScores.set(topic, { total: 0, count: 0 });
        }

        const stats = topicScores.get(topic);
        if (stats) {
          stats.total += percentage;
          stats.count += 1;
        }
      }
    }

    // Find topics with average score < 70% (stricter threshold)
    for (const [topic, stats] of topicScores.entries()) {
      const average = stats.total / stats.count;
      if (average < 70) {
        weakTopics.push(topic);
      }
    }

    if (weakTopics.length === 0) {
      this.logger.debug(
        `No weak topics found for user ${userId}. Skipping recommendations.`
      );
      return [];
    }

    try {
      this.logger.log(
        `Generating recommendations for ${weakTopics.length} weak topics: ${weakTopics.join(', ')}`
      );

      // Get user's quota status to determine premium tier
      const quotaStatus = await this.quotaService.getQuotaStatus(userId);
      const isPremium = quotaStatus.isPremium;
      const recommendationLimit = isPremium ? 3 : 1;

      this.logger.debug(
        `Calling AI service to generate ${recommendationLimit} recommendations for ${isPremium ? 'premium' : 'free'} user`
      );
      const recommendations = await this.aiService.generateRecommendations({
        weakTopics: weakTopics.slice(0, recommendationLimit), // Get topics based on tier
        recentAttempts: attempts.map((a) => ({
          topic: a.quiz?.topic,
          score: a.score,
          total: a.totalQuestions,
        })),
      });

      // Limit recommendations based on user tier
      const limitedRecommendations = recommendations.slice(
        0,
        recommendationLimit
      );

      // Save recommendations to database
      this.logger.debug(
        `Saving ${limitedRecommendations.length} recommendation(s) to database`
      );
      await Promise.all(
        limitedRecommendations.map((rec) =>
          this.prisma.recommendation.upsert({
            where: {
              userId_topic: {
                userId,
                topic: rec.topic,
              },
            },
            create: {
              userId,
              topic: rec.topic,
              reason: rec.reason,
              priority: rec.priority,
            },
            update: {
              reason: rec.reason,
              priority: rec.priority,
              visible: true, // Reset visibility when regenerating
              updatedAt: new Date(), // Ensure updatedAt is refreshed for cooldown tracking
            },
          })
        )
      );

      // Track quota usage for smart recommendations
      await this.quotaService.incrementQuota(userId, 'smartRecommendation');
      this.logger.debug(
        `Incremented smart recommendation quota for user ${userId}`
      );

      // Invalidate cache after generating new recommendations
      await this.cacheManager.del(`recommendations:${userId}`);

      this.logger.log(
        `Successfully generated and stored ${limitedRecommendations.length} recommendations for user ${userId}`
      );
      return limitedRecommendations;
    } catch (error) {
      this.logger.error(
        `Error generating recommendations for user ${userId}:`,
        error
      );
      return [];
    }
  }
}
