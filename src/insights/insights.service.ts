import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { AssessmentService } from '../assessment/assessment.service';
import { RetentionLevel } from '@prisma/client';
import { LangChainPrompts } from '../langchain/prompts';

export interface StudyInsights {
  understanding: {
    overall: number;
    summary: string;
    focusAreas: string[];
  };
  consistency: {
    streak: number;
    lastStudyDate: Date;
    studyFrequency: string;
  };
  recommendations: {
    topic: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }[];
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
  async getStudyInsights(userId: string): Promise<StudyInsights> {
    this.logger.log(`Generating study insights for user ${userId}`);

    const [performance, streak, topicProgress] = await Promise.all([
      this.assessmentService.analyzePerformance(userId),
      this.prisma.streak.findUnique({ where: { userId } }),
      this.prisma.topicProgress.findMany({
        where: { userId },
        orderBy: { strength: 'asc' },
        take: 5,
      }),
    ]);

    // Generate understanding summary using AI
    const understandingSummary = await this.generateUnderstandingSummary(
      performance.weakTopics[0] || 'your study areas',
      performance.averageScore
    );

    // Build recommendations
    const recommendations = topicProgress.map((tp) => ({
      topic: tp.topic,
      priority: this.getPriority(tp.retentionLevel),
      reason: this.getRecommendationReason(tp.topic, tp.retentionLevel),
    }));

    return {
      understanding: {
        overall: performance.averageScore,
        summary: understandingSummary,
        focusAreas: performance.weakTopics,
      },
      consistency: {
        streak: streak?.currentStreak || 0,
        lastStudyDate: streak?.lastActivityDate || new Date(),
        studyFrequency: this.calculateFrequency(streak),
      },
      recommendations: recommendations as any[],
    };
  }

  /**
   * Generate a summary of user understanding for a topic
   */
  async generateUnderstandingSummary(
    topic: string,
    performance: number
  ): Promise<string> {
    try {
      const prompt = await LangChainPrompts.understandingSummary.format({
        topic,
        performance: JSON.stringify({ averageScore: performance }),
      });
      const summary = await this.langchainService.invoke(prompt, {
        task: 'summary',
      });
      return summary;
    } catch (error) {
      this.logger.error('Error generating understanding summary:', error);
      return `Based on your performance in ${topic}, you have a good understanding of the material but could benefit from more practice in some areas.`;
    }
  }

  /**
   * Generate focus recommendations based on study patterns
   */
  async getFocusRecommendations(userId: string): Promise<string> {
    try {
      const insights = await this.prisma.topicProgress.findMany({
        where: { userId },
        orderBy: [{ strength: 'asc' }, { updatedAt: 'desc' }],
        take: 3,
        select: { topic: true, strength: true },
      });

      if (insights.length === 0) {
        return 'Start your learning journey by taking a quiz or creating flashcards!';
      }

      const prompt = `Based on these study insights, provide 2 targeted focus recommendations for the user:
${insights.map((i) => `- ${i.topic}: ${i.strength}%`).join('\n')}

Each recommendation should be 1 sentence, practical and actionable.`;

      const focusText = await this.langchainService.invoke(prompt, {
        task: 'focus_recommendation',
      });
      return focusText;
    } catch (error) {
      this.logger.error('Error generating focus recommendations:', error);
      return 'Keep up the consistent effort! Focus on topics with the lowest scores to see the biggest improvement.';
    }
  }

  private getPriority(level: RetentionLevel): 'high' | 'medium' | 'low' {
    switch (level) {
      case RetentionLevel.LEARNING:
        return 'high';
      case RetentionLevel.REINFORCEMENT:
        return 'high';
      case RetentionLevel.RECALL:
        return 'medium';
      case RetentionLevel.MASTERY:
        return 'low';
      default:
        return 'medium';
    }
  }

  private getRecommendationReason(
    topic: string,
    level: RetentionLevel
  ): string {
    switch (level) {
      case RetentionLevel.LEARNING:
        return `You're just starting with ${topic}. Frequent practice will help build a strong foundation.`;
      case RetentionLevel.REINFORCEMENT:
        return `${topic} is still fresh. Practice now to move it into long-term memory.`;
      case RetentionLevel.RECALL:
        return `You have a good grasp of ${topic}. Review occasionally to maintain your knowledge.`;
      case RetentionLevel.MASTERY:
        return `You've mastered ${topic}! Great job. Just keep it in your rotation for long-term retention.`;
      default:
        return `Consistent practice in ${topic} will lead to significant improvements.`;
    }
  }

  private calculateFrequency(streak: any): string {
    if (!streak) return 'Infrequent';
    const streakDays = streak.currentStreak;
    if (streakDays >= 5) return 'Daily Learner';
    if (streakDays >= 3) return 'Consistent';
    return 'Occasional';
  }

  /**
   * Legacy method for backward compatibility with CompanionService and Controller
   */
  async generateInsights(userId: string) {
    const topicProgress = await this.prisma.topicProgress.findMany({
      where: { userId },
      orderBy: { strength: 'asc' },
      take: 10,
    });

    return {
      toRevise: {
        topics: topicProgress.map((tp) => tp.topic),
      },
      topicStats: topicProgress.map((tp) => ({
        topic: tp.topic,
        strength: tp.strength,
        level: tp.retentionLevel,
      })),
    };
  }
}
