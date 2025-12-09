import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  /**
   * Return recommendations already stored in the database for a user.
   * This is intentionally read-only and does NOT call the AI.
   */
  async getRecommendations(userId: string) {
    this.logger.debug(`Fetching recommendations for user ${userId}`);

    const cacheKey = `recommendations:${userId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for recommendations, user ${userId}`);
      return cached;
    }

    const stored = await this.prisma.recommendation.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });

    if (!stored || stored.length === 0) {
      this.logger.debug(
        `No recommendations found for user ${userId}, returning defaults`
      );
      // Return sensible defaults for new users (frontend should call generation after attempts)
      return [
        {
          topic: 'General Knowledge',
          reason: 'Great starting point for new learners',
          priority: 'high',
        },
        {
          topic: 'Science Basics',
          reason: 'Build fundamental knowledge',
          priority: 'medium',
        },
        {
          topic: 'History',
          reason: 'Explore historical events',
          priority: 'low',
        },
      ];
    }

    this.logger.log(
      `Returning ${stored.length} recommendations for user ${userId}`
    );
    const result = stored.map((s) => ({
      topic: s.topic,
      reason: s.reason,
      priority: s.priority,
    }));

    // Cache recommendations for 10 minutes
    await this.cacheManager.set(cacheKey, result, 600000);

    return result;
  }

  /**
   * Analyze recent attempts for the user, generate recommendations using the AI,
   * and persist them to the database. This should be called after an attempt is
   * recorded (quiz or flashcard) rather than on every app load.
   */
  async generateAndStoreRecommendations(userId: string) {
    this.logger.log(`Generating recommendations for user ${userId}`);
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

    // Find topics with average score < 70%
    for (const [topic, stats] of topicScores.entries()) {
      const average = stats.total / stats.count;
      if (average < 70) {
        weakTopics.push(topic);
      }
    }

    try {
      this.logger.debug(
        `Found ${weakTopics.length} weak topics for user ${userId}: ${weakTopics.join(', ')}`
      );
      this.logger.debug(`Calling AI service to generate recommendations`);
      const recommendations = await this.aiService.generateRecommendations({
        weakTopics,
        recentAttempts: attempts.map((a) => ({
          topic: a.quiz?.topic,
          score: a.score,
          total: a.totalQuestions,
        })),
      });

      // Save recommendations to database
      this.logger.debug(
        `Saving ${recommendations.length} recommendations to database`
      );
      await Promise.all(
        recommendations.map((rec) =>
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
            },
          })
        )
      );

      // Invalidate cache after generating new recommendations
      await this.cacheManager.del(`recommendations:${userId}`);

      this.logger.log(
        `Successfully generated and stored ${recommendations.length} recommendations for user ${userId}`
      );
      return recommendations;
    } catch (error) {
      this.logger.error(
        `Error generating recommendations for user ${userId}:`,
        error
      );
      return [];
    }
  }
}
