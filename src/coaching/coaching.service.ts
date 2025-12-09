import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoachingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoachingTips(userId: string) {
    const [streak, weakAreas, recentAttempts] = await Promise.all([
      this.prisma.streak.findUnique({ where: { userId } }),
      this.prisma.weakArea.findMany({
        where: { userId, resolved: false },
        take: 3,
        orderBy: { errorCount: 'desc' },
      }),
      this.prisma.attempt.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const tips = [];

    // Streak analysis
    if (streak) {
      if (streak.currentStreak > 5) {
        tips.push({
          type: 'motivation',
          message: `You're on fire! ${streak.currentStreak} day streak. Keep it up!`,
          icon: 'fire',
        });
      } else if (streak.currentStreak === 0) {
        tips.push({
          type: 'motivation',
          message: 'Start a new streak today! Consistency is key.',
          icon: 'calendar',
        });
      }
    }

    // Weak areas analysis
    if (weakAreas.length > 0) {
      const topic = weakAreas[0].topic;
      tips.push({
        type: 'improvement',
        message: `You've been struggling with ${topic}. Try a focused quiz to improve.`,
        action: 'quiz',
        topic: topic,
        icon: 'target',
      });
    }

    // Performance analysis
    if (recentAttempts.length > 0) {
      const avgScore =
        recentAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0) /
        recentAttempts.length;
      if (avgScore > 80) {
        tips.push({
          type: 'challenge',
          message:
            "You're doing great! Try a harder difficulty to challenge yourself.",
          action: 'challenge',
          icon: 'trending-up',
        });
      }
    }

    // Fallback tip
    if (tips.length === 0) {
      tips.push({
        type: 'general',
        message: 'Review your flashcards to boost your retention.',
        action: 'flashcards',
        icon: 'book',
      });
    }

    return tips;
  }
}
