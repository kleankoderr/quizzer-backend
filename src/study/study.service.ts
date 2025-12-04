import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { RetentionLevel } from "@prisma/client";

@Injectable()
export class StudyService {
  private readonly logger = new Logger(StudyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Update topic progress based on quiz performance
   * Implements a basic Spaced Repetition System (SRS)
   */
  async updateProgress(
    userId: string,
    topic: string,
    scorePercentage: number,
    contentId?: string,
  ) {
    this.logger.log(
      `Updating progress for user ${userId}, topic ${topic}, score ${scorePercentage}%`,
    );

    let progress = await this.prisma.topicProgress.findUnique({
      where: {
        userId_topic: {
          userId,
          topic,
        },
      },
    });

    if (!progress) {
      progress = await this.prisma.topicProgress.create({
        data: {
          userId,
          topic,
          contentId,
          retentionLevel: RetentionLevel.LEARNING,
          strength: 0,
        },
      });
    }

    // Calculate new strength and level
    let newStrength = progress.strength;
    let newLevel = progress.retentionLevel;
    let nextReviewDays = 1;

    if (scorePercentage >= 80) {
      // Success: Increase strength
      newStrength = Math.min(100, newStrength + 20);

      // Level up logic
      if (newStrength >= 100 && newLevel === RetentionLevel.RECALL) {
        newLevel = RetentionLevel.MASTERY;
      } else if (
        newStrength >= 80 &&
        newLevel === RetentionLevel.REINFORCEMENT
      ) {
        newLevel = RetentionLevel.RECALL;
      } else if (newStrength >= 50 && newLevel === RetentionLevel.LEARNING) {
        newLevel = RetentionLevel.REINFORCEMENT;
      }

      // SRS Interval
      if (newLevel === RetentionLevel.MASTERY) nextReviewDays = 14;
      else if (newLevel === RetentionLevel.RECALL) nextReviewDays = 7;
      else if (newLevel === RetentionLevel.REINFORCEMENT) nextReviewDays = 3;
      else nextReviewDays = 1;
    } else if (scorePercentage < 50) {
      // Failure: Decrease strength
      newStrength = Math.max(0, newStrength - 10);
      // Reset interval on failure
      nextReviewDays = 1;
    }

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + nextReviewDays);

    await this.prisma.topicProgress.update({
      where: { id: progress.id },
      data: {
        strength: newStrength,
        retentionLevel: newLevel,
        lastReviewedAt: new Date(),
        nextReviewAt,
      },
    });

    return {
      topic,
      level: newLevel,
      strength: newStrength,
      nextReviewAt,
    };
  }

  /**
   * Get study insights and suggestions
   */
  async getStudyInsights(userId: string) {
    const progress = await this.prisma.topicProgress.findMany({
      where: { userId },
      include: { content: true },
      orderBy: { nextReviewAt: "asc" },
    });

    const dueForReview = progress.filter(
      (p) => new Date(p.nextReviewAt) <= new Date(),
    );
    const masteryCount = progress.filter(
      (p) => p.retentionLevel === RetentionLevel.MASTERY,
    ).length;
    const learningCount = progress.filter(
      (p) => p.retentionLevel === RetentionLevel.LEARNING,
    ).length;

    // Generate suggestions
    const suggestions = dueForReview.slice(0, 3).map((p) => ({
      type: "review",
      topic: p.topic,
      reason: "Due for spaced repetition review",
      priority: "high",
      contentId: p.contentId,
      quizId: p.content?.quizId,
      flashcardSetId: p.content?.flashcardSetId,
    }));

    if (suggestions.length < 3) {
      // Add some new topics or low strength topics
      const weakTopics = progress
        .filter((p) => p.strength < 50)
        .sort((a, b) => a.strength - b.strength)
        .slice(0, 3 - suggestions.length);

      weakTopics.forEach((p) => {
        suggestions.push({
          type: "practice",
          topic: p.topic,
          reason: "Low retention strength - needs reinforcement",
          priority: "medium",
          contentId: p.contentId,
          quizId: p.content?.quizId,
          flashcardSetId: p.content?.flashcardSetId,
        });
      });
    }

    return {
      stats: {
        totalTopics: progress.length,
        masteryCount,
        learningCount,
        dueForReview: dueForReview.length,
      },
      retentionDistribution: {
        [RetentionLevel.LEARNING]: learningCount,
        [RetentionLevel.REINFORCEMENT]: progress.filter(
          (p) => p.retentionLevel === RetentionLevel.REINFORCEMENT,
        ).length,
        [RetentionLevel.RECALL]: progress.filter(
          (p) => p.retentionLevel === RetentionLevel.RECALL,
        ).length,
        [RetentionLevel.MASTERY]: masteryCount,
      },
      suggestions,
    };
  }
}
