import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AssessmentService } from '../assessment/assessment.service';
import { InsightsService } from '../insights/insights.service';
import { RetentionLevel } from '@prisma/client';

export interface CompanionMessage {
  type:
    | 'reminder'
    | 'encouragement'
    | 'suggestion'
    | 'reflection'
    | 'celebration';
  title: string;
  message: string;
  action?: {
    label: string;
    link: string;
  };
  priority: 'high' | 'medium' | 'low';
}

@Injectable()
export class CompanionService {
  private readonly logger = new Logger(CompanionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly assessmentService: AssessmentService,
    private readonly insightsService: InsightsService
  ) {}

  /**
   * Generate personalized companion messages
   */
  async generateMessages(userId: string): Promise<CompanionMessage[]> {
    this.logger.log(`Generating companion messages for user ${userId}`);

    const [performance, timing, streak, topicProgress] = await Promise.all([
      this.assessmentService.analyzePerformance(userId),
      this.assessmentService.suggestQuizTiming(userId),
      this.prisma.streak.findUnique({ where: { userId } }),
      this.prisma.topicProgress.findMany({ where: { userId } }),
    ]);

    const messages: CompanionMessage[] = [];

    // Review reminders
    if (timing.dueTopics.length > 0) {
      messages.push({
        type: 'reminder',
        title: '📚 Time to Review!',
        message: `You have ${timing.dueTopics.length} topic(s) ready for review. Spaced repetition works best when you review on time!`,
        action: {
          label: 'Start Review',
          link: '/quizzes',
        },
        priority: 'high',
      });
    }

    // Streak encouragement
    if (streak) {
      if (streak.currentStreak >= 7) {
        messages.push({
          type: 'celebration',
          title: '🔥 Amazing Streak!',
          message: `You're on a ${streak.currentStreak}-day streak! You're building incredible learning habits.`,
          priority: 'medium',
        });
      } else if (streak.currentStreak === 0) {
        const lastActivity = new Date(streak.lastActivityDate);
        const daysSince = Math.floor(
          (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSince === 1) {
          messages.push({
            type: 'encouragement',
            title: '💪 Come Back Strong!',
            message:
              "Don't let yesterday's break become a habit. Start a new streak today!",
            action: {
              label: 'Take a Quick Quiz',
              link: '/quizzes',
            },
            priority: 'high',
          });
        }
      }
    }

    // Progress celebration
    const masteryCount = topicProgress.filter(
      (tp) => tp.retentionLevel === RetentionLevel.MASTERY
    ).length;
    if (masteryCount > 0 && masteryCount % 5 === 0) {
      messages.push({
        type: 'celebration',
        title: '🎉 Milestone Achieved!',
        message: `You've mastered ${masteryCount} topics! Your dedication is paying off.`,
        priority: 'medium',
      });
    }

    // Study session suggestion
    if (timing.upcomingTopics.length > 0 && messages.length < 2) {
      const preferredTime = performance.preferredTime;
      messages.push({
        type: 'suggestion',
        title: '✨ Study Session Suggestion',
        message: `Based on your patterns, ${preferredTime} is your best study time. You have ${timing.upcomingTopics.length} topic(s) coming up for review.`,
        action: {
          label: 'Plan Study Session',
          link: '/insights',
        },
        priority: 'low',
      });
    }

    // Reflective question
    if (performance.attemptCount > 10 && messages.length < 3) {
      const reflectiveQuestion =
        await this.generateReflectiveQuestion(performance);
      messages.push({
        type: 'reflection',
        title: '🤔 Reflection Time',
        message: reflectiveQuestion,
        priority: 'low',
      });
    }

    // Weak area support
    const weakAreas = await this.assessmentService.getWeakAreas(userId, false);
    if (weakAreas.length > 0 && messages.length < 3) {
      const topWeakArea = weakAreas[0];
      messages.push({
        type: 'encouragement',
        title: "💡 Let's Tackle This Together",
        message: `I noticed you're finding ${topWeakArea.topic} challenging. How about we break it down with some scenario-based questions?`,
        action: {
          label: 'Practice Now',
          link: `/quizzes?topic=${encodeURIComponent(topWeakArea.topic)}`,
        },
        priority: 'medium',
      });
    }

    // Encouragement for consistent learners
    if (
      performance.attemptCount > 5 &&
      performance.averageScore > 70 &&
      messages.length < 3
    ) {
      messages.push({
        type: 'encouragement',
        title: "🌟 You're Doing Great!",
        message: `Your average score is ${performance.averageScore.toFixed(0)}%! Keep up this consistent effort and you'll reach mastery in no time.`,
        priority: 'low',
      });
    }

    return messages.slice(0, 3); // Return top 3 messages
  }

  /**
   * Generate a reflective question using AI
   */
  private async generateReflectiveQuestion(performance: any): Promise<string> {
    try {
      const prompt = `Generate a brief, thoughtful reflection question for a learner with these stats:
- Average score: ${performance.averageScore.toFixed(0)}%
- Strong topics: ${performance.strongTopics.join(', ') || 'None yet'}
- Weak topics: ${performance.weakTopics.join(', ') || 'None yet'}
- Total attempts: ${performance.attemptCount}

The question should be encouraging, help them think about their learning process, and be 1-2 sentences max. Tailor the tone to be universally relatable and encouraging.`;

      const question = await this.aiService.generateContent({
        prompt,
        maxTokens: 100,
      });
      return question.trim();
    } catch (error) {
      this.logger.error('Error generating reflective question:', error);
      return 'What learning strategy has worked best for you so far?';
    }
  }

  /**
   * Get study session recommendations
   */
  async getStudySessionRecommendations(userId: string) {
    this.logger.log(`Getting study session recommendations for user ${userId}`);

    const [timing, quizRecommendations, insights] = await Promise.all([
      this.assessmentService.suggestQuizTiming(userId),
      this.assessmentService.recommendQuizTypes(userId),
      this.insightsService.generateInsights(userId),
    ]);

    return {
      timing: {
        recommendNow: timing.recommendNow,
        preferredTime: timing.preferredTime,
        message: timing.message,
      },
      suggestedQuizzes: quizRecommendations.slice(0, 3),
      focusTopics: insights.toRevise.topics.slice(0, 3),
      estimatedDuration: this.estimateSessionDuration(
        timing.dueTopics.length,
        quizRecommendations.length
      ),
    };
  }

  /**
   * Estimate study session duration
   */
  private estimateSessionDuration(
    dueTopicsCount: number,
    quizCount: number
  ): number {
    // Rough estimate: 10 minutes per quiz, 5 minutes per review topic
    return dueTopicsCount * 5 + quizCount * 10;
  }

  /**
   * Track study session
   */
  async trackStudySession(
    userId: string,
    type: string,
    duration: number,
    itemsStudied: number,
    performance?: number
  ) {
    this.logger.log(`Tracking study session for user ${userId}`);

    return this.prisma.studySession.create({
      data: {
        userId,
        type,
        duration,
        itemsStudied,
        performance,
        endedAt: new Date(),
      },
    });
  }

  /**
   * Get study statistics
   */
  async getStudyStatistics(userId: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const sessions = await this.prisma.studySession.findMany({
      where: {
        userId,
        startedAt: { gte: since },
      },
      orderBy: { startedAt: 'desc' },
    });

    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    const totalItems = sessions.reduce((sum, s) => sum + s.itemsStudied, 0);
    let avgPerformance: number;
    if (sessions.filter((s) => s.performance != null).length > 0) {
      avgPerformance =
        sessions
          .filter((s) => s.performance != null)
          .reduce((sum, s) => sum + s.performance, 0) /
        sessions.filter((s) => s.performance != null).length;
    } else {
      avgPerformance = 0;
    }

    return {
      totalSessions: sessions.length,
      totalDuration: Math.round(totalDuration / 60), // minutes
      totalItems,
      averagePerformance: Math.round(avgPerformance),
      sessionsPerDay: sessions.length / days,
    };
  }

  /**
   * Generate daily motivation
   */
  async getDailyMotivation(userId: string): Promise<string> {
    try {
      const [streak, performance] = await Promise.all([
        this.prisma.streak.findUnique({ where: { userId } }),
        this.assessmentService.analyzePerformance(userId),
      ]);

      const prompt = `Generate a brief, warm, motivational message for a learner:
- Current streak: ${streak?.currentStreak || 0} days
- Average score: ${performance.averageScore.toFixed(0)}%
- Total attempts: ${performance.attemptCount}

Keep it to 1-2 sentences, friendly and encouraging. Tailor the tone to be universally relatable and encouraging.`;

      const motivation = await this.aiService.generateContent({
        prompt,
        maxTokens: 100,
      });
      return motivation.trim();
    } catch (error) {
      this.logger.error('Error generating daily motivation:', error);
      return "Every step forward is progress. Let's make today count! 🌟";
    }
  }
}
