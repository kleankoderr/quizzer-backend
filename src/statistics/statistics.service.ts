import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string) {
    // Get all attempts for the user
    const attempts = await this.prisma.attempt.findMany({
      where: { userId },
      include: {
        quiz: true,
        flashcardSet: true,
      },
    });

    // Calculate statistics
    const totalAttempts = attempts.length;
    const quizAttempts = attempts.filter((a) => a.type === "quiz").length;
    const flashcardAttempts = attempts.filter(
      (a) => a.type === "flashcard"
    ).length;

    // Calculate average accuracy
    const attemptsWithScores = attempts.filter(
      (a) => a.score !== null && a.totalQuestions !== null
    );
    const averageAccuracy =
      attemptsWithScores.length > 0
        ? attemptsWithScores.reduce(
            (sum, a) => sum + (Math.max(0, a.score!) / a.totalQuestions!) * 100,
            0
          ) / attemptsWithScores.length
        : 0;

    // Get streak data
    const streak = await this.prisma.streak.findUnique({
      where: { userId },
    });

    // Calculate total time spent (simplified - would need actual tracking)
    const totalTimeSpent = totalAttempts * 15; // Assume 15 minutes per attempt

    return {
      totalAttempts,
      quizAttempts,
      flashcardAttempts,
      averageAccuracy,
      currentStreak: streak?.currentStreak || 0,
      totalTimeSpent,
    };
  }

  async getAttempts(
    userId: string,
    filters?: {
      type?: "quiz" | "flashcard";
      quizId?: string;
      flashcardSetId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      page?: number;
    }
  ) {
    const where: any = { userId };

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.quizId) {
      where.quizId = filters.quizId;
    }

    if (filters?.flashcardSetId) {
      where.flashcardSetId = filters.flashcardSetId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.completedAt = {};
      if (filters.startDate) {
        where.completedAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.completedAt.lte = new Date(filters.endDate);
      }
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const [attempts, total] = await Promise.all([
      this.prisma.attempt.findMany({
        where,
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              topic: true,
            },
          },
          flashcardSet: {
            select: {
              id: true,
              title: true,
              topic: true,
            },
          },
        },
        orderBy: {
          completedAt: "desc",
        },
        take: limit,
        skip: skip,
      }),
      this.prisma.attempt.count({ where }),
    ]);

    return {
      attempts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPerformanceByTopic(userId: string) {
    const attempts = await this.prisma.attempt.findMany({
      where: {
        userId,
        score: { not: null },
        totalQuestions: { not: null },
      },
      include: {
        quiz: {
          select: { topic: true },
        },
        flashcardSet: {
          select: { topic: true },
        },
      },
    });

    // Group by topic
    const topicStats: Map<
      string,
      { attempts: number; totalScore: number; totalQuestions: number }
    > = new Map();

    attempts.forEach((attempt) => {
      const topic =
        attempt.quiz?.topic || attempt.flashcardSet?.topic || "Unknown";

      if (!topicStats.has(topic)) {
        topicStats.set(topic, {
          attempts: 0,
          totalScore: 0,
          totalQuestions: 0,
        });
      }

      const stats = topicStats.get(topic)!;
      stats.attempts++;
      stats.totalScore += Math.max(0, attempt.score!);
      stats.totalQuestions += attempt.totalQuestions!;
    });

    // Convert to array and calculate averages
    return Array.from(topicStats.entries()).map(([topic, stats]) => ({
      topic,
      attempts: stats.attempts,
      averageScore: stats.totalScore / stats.attempts,
      accuracy: (stats.totalScore / stats.totalQuestions) * 100,
    }));
  }

  async getActivityHeatmap(userId: string, year?: number) {
    const currentYear = year || new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);

    const attempts = await this.prisma.attempt.findMany({
      where: {
        userId,
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        completedAt: true,
      },
    });

    // Group by date
    const activityMap: Map<string, number> = new Map();

    attempts.forEach((attempt) => {
      const date = attempt.completedAt.toISOString().split("T")[0];
      activityMap.set(date, (activityMap.get(date) || 0) + 1);
    });

    return Array.from(activityMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }
}
