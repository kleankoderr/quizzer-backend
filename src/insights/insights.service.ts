import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { AssessmentService } from '../assessment/assessment.service';
import { RetentionLevel } from '@prisma/client';

export interface StudyInsights {
  understanding: {
    summary: string;
    masteredTopics: string[];
    learningTopics: string[];
    progressPercentage: number;
  };
  toRevise: {
    topics: Array<{
      topic: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
    }>;
  };
  focusAreas: {
    weakConcepts: Array<{
      topic: string;
      concept: string;
      errorCount: number;
    }>;
    recommendations: string[];
  };
  practice: {
    suggestedQuizzes: Array<{
      topic: string;
      quizType: string;
      reason: string;
    }>;
  };
  trends: {
    weeklyProgress: number;
    streakDays: number;
    totalStudyTime: number;
  };
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly assessmentService: AssessmentService
  ) {}

  /**
   * Generate comprehensive study insights for a user
   */
  async generateInsights(userId: string): Promise<StudyInsights> {
    this.logger.log(`Generating study insights for user ${userId}`);

    const [performance, topicProgress, weakAreas, streak, recentAttempts] =
      await Promise.all([
        this.assessmentService.analyzePerformance(userId),
        this.prisma.topicProgress.findMany({ where: { userId } }),
        this.assessmentService.getWeakAreas(userId, false),
        this.prisma.streak.findUnique({ where: { userId } }),
        this.prisma.attempt.findMany({
          where: {
            userId,
            completedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          include: { quiz: true },
        }),
      ]);

    // Understanding summary
    const masteredTopics = topicProgress
      .filter((tp) => tp.retentionLevel === RetentionLevel.MASTERY)
      .map((tp) => tp.topic);

    const learningTopics = topicProgress
      .filter(
        (tp) =>
          tp.retentionLevel === RetentionLevel.LEARNING ||
          tp.retentionLevel === RetentionLevel.REINFORCEMENT
      )
      .map((tp) => tp.topic);

    const progressPercentage =
      topicProgress.length > 0
        ? (masteredTopics.length / topicProgress.length) * 100
        : 0;

    // Topics to revise
    const dueTopics = topicProgress.filter(
      (tp) => new Date(tp.nextReviewAt) <= new Date()
    );

    const toRevise = dueTopics.map((tp) => ({
      topic: tp.topic,
      reason: this.getRevisionReason(tp.retentionLevel, tp.strength),
      priority: this.getRevisionPriority(tp.retentionLevel, tp.strength),
    }));

    // Focus areas
    const weakConcepts = weakAreas.slice(0, 5).map((wa) => ({
      topic: wa.topic,
      concept: wa.concept,
      errorCount: wa.errorCount,
    }));

    const recommendations = await this.generateFocusRecommendations(
      performance,
      weakAreas
    );

    // Practice suggestions
    const quizRecommendations =
      await this.assessmentService.recommendQuizTypes(userId);
    const suggestedQuizzes = quizRecommendations.slice(0, 3).map((rec) => ({
      topic: rec.suggestedTopics[0] || 'General',
      quizType: rec.quizType,
      reason: rec.reason,
    }));

    // Trends
    const weeklyProgress = this.calculateWeeklyProgress(recentAttempts);
    const totalStudyTime = recentAttempts.reduce(
      (sum, a) => sum + (a.timeSpent || 0),
      0
    );

    // Generate AI-powered summary
    const understandingSummary = await this.generateUnderstandingSummary(
      masteredTopics,
      learningTopics,
      progressPercentage
    );

    return {
      understanding: {
        summary: understandingSummary,
        masteredTopics,
        learningTopics,
        progressPercentage: Math.round(progressPercentage),
      },
      toRevise: {
        topics: toRevise,
      },
      focusAreas: {
        weakConcepts,
        recommendations,
      },
      practice: {
        suggestedQuizzes,
      },
      trends: {
        weeklyProgress: Math.round(weeklyProgress),
        streakDays: streak?.currentStreak || 0,
        totalStudyTime: Math.round(totalStudyTime / 60), // Convert to minutes
      },
    };
  }

  /**
   * Get revision reason based on retention level and strength
   */
  private getRevisionReason(level: RetentionLevel, strength: number): string {
    if (level === RetentionLevel.LEARNING) {
      return 'Still learning - needs regular practice';
    }
    if (level === RetentionLevel.REINFORCEMENT) {
      return 'Building confidence - review to strengthen memory';
    }
    if (level === RetentionLevel.RECALL) {
      return 'Due for spaced repetition review';
    }
    if (strength < 70) {
      return 'Memory strength declining - review recommended';
    }
    return 'Scheduled review to maintain mastery';
  }

  /**
   * Get revision priority
   */
  private getRevisionPriority(
    level: RetentionLevel,
    strength: number
  ): 'high' | 'medium' | 'low' {
    if (level === RetentionLevel.LEARNING || strength < 50) return 'high';
    if (level === RetentionLevel.REINFORCEMENT || strength < 70)
      return 'medium';
    return 'low';
  }

  /**
   * Generate focus recommendations
   */
  private async generateFocusRecommendations(
    performance: any,
    weakAreas: any[]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    if (weakAreas.length > 0) {
      const topWeakTopic = weakAreas[0].topic;
      recommendations.push(
        `Focus on ${topWeakTopic} - you've struggled with this ${weakAreas[0].errorCount} times`
      );
    }

    if (performance.weakTopics.length > 0) {
      recommendations.push(
        `Review ${performance.weakTopics.join(', ')} - your scores are below 60%`
      );
    }

    if (performance.averageScore < 70) {
      recommendations.push(
        'Consider taking more Quick Check quizzes to build confidence'
      );
    } else if (performance.averageScore > 85) {
      recommendations.push(
        'Great progress! Try Timed Tests to challenge yourself'
      );
    }

    return recommendations;
  }

  /**
   * Calculate weekly progress
   */
  private calculateWeeklyProgress(attempts: any[]): number {
    if (attempts.length === 0) return 0;

    const scores = attempts
      .filter((a) => a.score != null && a.totalQuestions != null)
      .map((a) => (a.score / a.totalQuestions) * 100);

    if (scores.length === 0) return 0;

    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return avgScore;
  }

  /**
   * Generate AI-powered understanding summary
   */
  private async generateUnderstandingSummary(
    masteredTopics: string[],
    learningTopics: string[],
    progressPercentage: number
  ): Promise<string> {
    try {
      const prompt = `Generate a brief, encouraging summary of a learner's progress:
- Mastered topics: ${masteredTopics.join(', ') || 'None yet'}
- Currently learning: ${learningTopics.join(', ') || 'None yet'}
- Overall progress: ${progressPercentage.toFixed(0)}%

Write a 2-3 sentence summary that is warm, encouraging, and specific. Focus on achievements and next steps. Tailor the tone to be motivating and inclusive.`;

      const summary = await this.aiService.generateContent({
        prompt,
        maxTokens: 150,
      });
      return summary.trim();
    } catch (error) {
      this.logger.error('Error generating understanding summary:', error);
      return this.getDefaultSummary(
        masteredTopics,
        learningTopics,
        progressPercentage
      );
    }
  }

  /**
   * Get default summary if AI fails
   */
  private getDefaultSummary(
    masteredTopics: string[],
    learningTopics: string[],
    progressPercentage: number
  ): string {
    if (progressPercentage === 0) {
      return "You're just getting started! Keep practicing and you'll see progress soon.";
    }
    if (progressPercentage < 30) {
      return `You're making progress! You've mastered ${masteredTopics.length} topic(s) and are actively learning ${learningTopics.length} more. Keep up the consistent effort!`;
    }
    if (progressPercentage < 70) {
      return `Great work! You're ${progressPercentage.toFixed(0)}% of the way there. You've mastered ${masteredTopics.join(', ')} and are building strong foundations in ${learningTopics.length} other topics.`;
    }
    return `Excellent progress! You've mastered ${masteredTopics.length} topics and are well on your way to complete mastery. Keep reviewing to maintain your knowledge!`;
  }
}
