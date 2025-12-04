import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { QuizType, RetentionLevel } from "@prisma/client";

export interface PerformancePattern {
  averageScore: number;
  attemptCount: number;
  preferredTime: string;
  strongTopics: string[];
  weakTopics: string[];
  retentionLevels: Record<string, RetentionLevel>;
}

@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Analyze user performance patterns across all attempts
   */
  async analyzePerformance(userId: string): Promise<PerformancePattern> {
    this.logger.log(`Analyzing performance for user ${userId}`);

    const [attempts, topicProgress] = await Promise.all([
      this.prisma.attempt.findMany({
        where: { userId },
        orderBy: { completedAt: "desc" },
        take: 50,
        include: {
          quiz: { select: { topic: true, quizType: true } },
          flashcardSet: { select: { topic: true } },
        },
      }),
      this.prisma.topicProgress.findMany({
        where: { userId },
      }),
    ]);

    // Calculate average score
    const quizAttempts = attempts.filter(
      (a) => a.type === "quiz" && a.score != null,
    );
    const averageScore =
      quizAttempts.length > 0
        ? quizAttempts.reduce(
            (sum, a) => sum + (a.score! / a.totalQuestions!) * 100,
            0,
          ) / quizAttempts.length
        : 0;

    // Analyze topics
    const topicScores = new Map<string, { total: number; count: number }>();
    quizAttempts.forEach((attempt) => {
      const topic = attempt.quiz?.topic || attempt.flashcardSet?.topic;
      if (!topic) return;

      if (!topicScores.has(topic)) {
        topicScores.set(topic, { total: 0, count: 0 });
      }
      const stats = topicScores.get(topic)!;
      stats.total += (attempt.score! / attempt.totalQuestions!) * 100;
      stats.count += 1;
    });

    const strongTopics: string[] = [];
    const weakTopics: string[] = [];

    topicScores.forEach((stats, topic) => {
      const avg = stats.total / stats.count;
      if (avg >= 80) strongTopics.push(topic);
      else if (avg < 60) weakTopics.push(topic);
    });

    // Analyze preferred time (when user studies most)
    const hourCounts = new Map<number, number>();
    attempts.forEach((attempt) => {
      const hour = new Date(attempt.completedAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    let preferredHour = 0;
    let maxCount = 0;
    hourCounts.forEach((count, hour) => {
      if (count > maxCount) {
        maxCount = count;
        preferredHour = hour;
      }
    });

    const preferredTime =
      preferredHour < 12
        ? "morning"
        : preferredHour < 17
          ? "afternoon"
          : "evening";

    // Build retention levels map
    const retentionLevels: Record<string, RetentionLevel> = {};
    topicProgress.forEach((tp) => {
      retentionLevels[tp.topic] = tp.retentionLevel;
    });

    return {
      averageScore,
      attemptCount: attempts.length,
      preferredTime,
      strongTopics,
      weakTopics,
      retentionLevels,
    };
  }

  /**
   * Recommend quiz types based on learning patterns
   */
  async recommendQuizTypes(userId: string): Promise<any[]> {
    this.logger.log(`Generating quiz type recommendations for user ${userId}`);

    const performance = await this.analyzePerformance(userId);
    const recommendations: any[] = [];

    // Quick Check - for topics in LEARNING or REINFORCEMENT
    const learningTopics = Object.entries(performance.retentionLevels)
      .filter(
        ([_, level]) =>
          level === RetentionLevel.LEARNING ||
          level === RetentionLevel.REINFORCEMENT,
      )
      .map(([topic]) => topic);

    if (learningTopics.length > 0) {
      recommendations.push({
        quizType: QuizType.QUICK_CHECK,
        reason: "Quick checks help reinforce new concepts you're learning",
        suggestedTopics: learningTopics.slice(0, 3),
        priority: "high",
      });
    }

    // Timed Test - for topics in RECALL or MASTERY
    const recallTopics = Object.entries(performance.retentionLevels)
      .filter(
        ([_, level]) =>
          level === RetentionLevel.RECALL || level === RetentionLevel.MASTERY,
      )
      .map(([topic]) => topic);

    if (recallTopics.length > 0) {
      recommendations.push({
        quizType: QuizType.TIMED_TEST,
        reason: "Timed tests help you practice recall under pressure",
        suggestedTopics: recallTopics.slice(0, 3),
        priority: "medium",
      });
    }

    // Scenario-Based - for weak topics
    if (performance.weakTopics.length > 0) {
      recommendations.push({
        quizType: QuizType.SCENARIO_BASED,
        reason:
          "Scenario-based questions help you apply concepts in real situations",
        suggestedTopics: performance.weakTopics.slice(0, 3),
        priority: "high",
      });
    }

    // Confidence-Based - general recommendation
    recommendations.push({
      quizType: QuizType.CONFIDENCE_BASED,
      reason:
        "Confidence-based quizzes help identify what you truly understand",
      suggestedTopics: [...performance.weakTopics, ...learningTopics].slice(
        0,
        3,
      ),
      priority: "medium",
    });

    return recommendations;
  }

  /**
   * Suggest optimal timing for next quiz
   */
  async suggestQuizTiming(userId: string): Promise<any> {
    this.logger.log(`Suggesting quiz timing for user ${userId}`);

    const [performance, topicProgress] = await Promise.all([
      this.analyzePerformance(userId),
      this.prisma.topicProgress.findMany({
        where: { userId },
        orderBy: { nextReviewAt: "asc" },
      }),
    ]);

    const dueTopics = topicProgress.filter(
      (tp) => new Date(tp.nextReviewAt) <= new Date(),
    );

    const upcomingTopics = topicProgress.filter(
      (tp) =>
        new Date(tp.nextReviewAt) > new Date() &&
        new Date(tp.nextReviewAt) <= new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    return {
      recommendNow: dueTopics.length > 0,
      dueTopics: dueTopics.map((tp) => ({
        topic: tp.topic,
        retentionLevel: tp.retentionLevel,
        strength: tp.strength,
      })),
      upcomingTopics: upcomingTopics.map((tp) => ({
        topic: tp.topic,
        dueAt: tp.nextReviewAt,
      })),
      preferredTime: performance.preferredTime,
      message:
        dueTopics.length > 0
          ? `You have ${dueTopics.length} topic(s) due for review now!`
          : upcomingTopics.length > 0
            ? `You have ${upcomingTopics.length} topic(s) coming up for review soon.`
            : "Great job! You're all caught up with your reviews.",
    };
  }

  /**
   * Adjust difficulty dynamically based on recent performance
   */
  async adjustDifficulty(userId: string, topic: string): Promise<string> {
    this.logger.log(`Adjusting difficulty for user ${userId}, topic ${topic}`);

    const recentAttempts = await this.prisma.attempt.findMany({
      where: {
        userId,
        quiz: { topic },
      },
      orderBy: { completedAt: "desc" },
      take: 5,
      include: { quiz: true },
    });

    if (recentAttempts.length === 0) return "medium";

    const avgScore =
      recentAttempts.reduce(
        (sum, a) => sum + (a.score! / a.totalQuestions!) * 100,
        0,
      ) / recentAttempts.length;

    if (avgScore >= 85) return "hard";
    if (avgScore >= 70) return "medium";
    return "easy";
  }

  /**
   * Track weak areas from quiz attempts
   */
  async trackWeakAreas(
    userId: string,
    topic: string,
    answers: any[],
  ): Promise<void> {
    this.logger.log(`Tracking weak areas for user ${userId}, topic ${topic}`);

    for (const answer of answers) {
      if (!answer.correct) {
        // Extract concept from question (simplified - could use AI)
        const concept = answer.question.substring(0, 100);

        await this.prisma.weakArea.upsert({
          where: {
            userId_topic_concept: {
              userId,
              topic,
              concept,
            },
          },
          create: {
            userId,
            topic,
            concept,
            errorCount: 1,
            lastErrorAt: new Date(),
          },
          update: {
            errorCount: { increment: 1 },
            lastErrorAt: new Date(),
            resolved: false,
          },
        });
      }
    }
  }

  /**
   * Get weak areas for a user
   */
  async getWeakAreas(userId: string, resolved: boolean = false) {
    return this.prisma.weakArea.findMany({
      where: { userId, resolved },
      orderBy: { errorCount: "desc" },
      take: 10,
    });
  }

  /**
   * Mark weak area as resolved
   */
  async resolveWeakArea(weakAreaId: string) {
    return this.prisma.weakArea.update({
      where: { id: weakAreaId },
      data: { resolved: true },
    });
  }
}
