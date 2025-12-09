import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStreak(userId: string) {
    if (!userId) {
      this.logger.warn('getCurrentStreak called without userId');
      return null;
    }

    let streak = await this.prisma.streak.findUnique({
      where: { userId },
    });

    if (!streak) {
      streak = await this.prisma.streak.create({
        data: {
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: new Date(),
          totalXP: 0,
          level: 1,
        },
      });
    }

    return this.enrichStreakData(streak);
  }

  async updateStreak(userId: string, score?: number, totalQuestions?: number) {
    if (!userId) {
      this.logger.warn('updateStreak called without userId');
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = await this.prisma.streak.findUnique({
      where: { userId },
    });

    if (!streak) {
      streak = await this.prisma.streak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: new Date(),
          totalXP: 0,
          level: 1,
        },
      });
      this.logger.log(`New streak started for user ${userId}`);
      return this.enrichStreakData(streak);
    }

    const lastActivity = new Date(streak.lastActivityDate);
    lastActivity.setHours(0, 0, 0, 0);

    const daysSinceLastActivity = Math.floor(
      (today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate XP from this activity
    const earnedXP = this.calculateXP(
      score,
      totalQuestions,
      streak.currentStreak
    );
    const newTotalXP = (streak.totalXP || 0) + earnedXP;
    const newLevel = this.calculateLevel(newTotalXP);
    const leveledUp = newLevel > (streak.level || 1);

    let updatedStreak;
    if (daysSinceLastActivity === 0) {
      // Same day - just add XP
      updatedStreak = await this.prisma.streak.update({
        where: { userId },
        data: {
          totalXP: newTotalXP,
          level: newLevel,
        },
      });
    } else if (daysSinceLastActivity === 1) {
      // Consecutive day - increase streak and add XP
      const newStreak = streak.currentStreak + 1;
      const streakBonus = this.getStreakBonus(newStreak);

      updatedStreak = await this.prisma.streak.update({
        where: { userId },
        data: {
          currentStreak: newStreak,
          longestStreak: Math.max(newStreak, streak.longestStreak),
          lastActivityDate: new Date(),
          totalXP: newTotalXP + streakBonus,
          level: this.calculateLevel(newTotalXP + streakBonus),
        },
      });

      this.logger.log(
        `Streak increased to ${newStreak} for user ${userId}, bonus XP: ${streakBonus}`
      );
    } else {
      // Streak broken - reset but keep XP and level
      updatedStreak = await this.prisma.streak.update({
        where: { userId },
        data: {
          currentStreak: 1,
          lastActivityDate: new Date(),
          totalXP: newTotalXP,
          level: newLevel,
        },
      });

      this.logger.log(`Streak broken for user ${userId}, restarting from 1`);
    }

    return this.enrichStreakData(updatedStreak, {
      earnedXP,
      leveledUp,
      previousLevel: streak.level || 1,
    });
  }

  private calculateXP(
    score?: number,
    totalQuestions?: number,
    currentStreak = 0
  ): number {
    if (!score || !totalQuestions) return 10; // Base XP for any activity

    const percentage = (score / totalQuestions) * 100;
    let xp = 10; // Base XP

    // Bonus for performance
    if (percentage >= 90) xp += 50;
    else if (percentage >= 80) xp += 30;
    else if (percentage >= 70) xp += 20;
    else if (percentage >= 60) xp += 10;

    // Small streak multiplier
    if (currentStreak >= 7) xp = Math.floor(xp * 1.5);
    else if (currentStreak >= 3) xp = Math.floor(xp * 1.25);

    return xp;
  }

  private getStreakBonus(streak: number): number {
    if (streak % 30 === 0) return 500; // Monthly milestone
    if (streak % 7 === 0) return 100; // Weekly milestone
    if (streak === 3) return 25; // First 3-day streak
    return 0;
  }

  private calculateLevel(totalXP: number): number {
    // Level formula: level = floor(sqrt(totalXP / 100)) + 1
    // Level 1: 0 XP, Level 2: 100 XP, Level 3: 400 XP, Level 4: 900 XP, etc.
    return Math.floor(Math.sqrt(totalXP / 100)) + 1;
  }

  private getXPForNextLevel(currentLevel: number): number {
    return currentLevel * currentLevel * 100;
  }

  private enrichStreakData(streak: any, extras?: any) {
    const level = streak.level || 1;
    const totalXP = streak.totalXP || 0;
    const xpForNextLevel = this.getXPForNextLevel(level);
    const xpForCurrentLevel = (level - 1) * (level - 1) * 100;
    const xpProgress = totalXP - xpForCurrentLevel;
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;

    return {
      ...streak,
      level,
      totalXP,
      xpForNextLevel,
      xpProgress,
      xpNeeded,
      progressPercentage: Math.floor((xpProgress / xpNeeded) * 100),
      achievements: this.getAchievements(streak),
      milestones: this.getMilestones(streak),
      ...extras,
    };
  }

  private getAchievements(streak: any) {
    const achievements = [];
    const currentStreak = streak.currentStreak || 0;
    const longestStreak = streak.longestStreak || 0;
    const level = streak.level || 1;

    // Streak achievements
    if (currentStreak >= 30)
      achievements.push({
        icon: '🔥',
        name: 'Fire Month',
        description: '30 day streak!',
      });
    else if (currentStreak >= 14)
      achievements.push({
        icon: '⚡',
        name: 'Two Weeks Strong',
        description: '14 day streak!',
      });
    else if (currentStreak >= 7)
      achievements.push({
        icon: '✨',
        name: 'Week Warrior',
        description: '7 day streak!',
      });
    else if (currentStreak >= 3)
      achievements.push({
        icon: '🌟',
        name: 'Getting Started',
        description: '3 day streak!',
      });

    // Level achievements
    if (level >= 20)
      achievements.push({
        icon: '👑',
        name: 'Master',
        description: 'Reached level 20!',
      });
    else if (level >= 10)
      achievements.push({
        icon: '🏆',
        name: 'Expert',
        description: 'Reached level 10!',
      });
    else if (level >= 5)
      achievements.push({
        icon: '🎓',
        name: 'Scholar',
        description: 'Reached level 5!',
      });

    // Longest streak achievements
    if (longestStreak >= 100)
      achievements.push({
        icon: '💯',
        name: 'Century',
        description: '100 day streak achieved!',
      });
    else if (longestStreak >= 50)
      achievements.push({
        icon: '🌈',
        name: 'Half Century',
        description: '50 day streak achieved!',
      });

    return achievements;
  }

  private getMilestones(streak: any) {
    const currentStreak = streak.currentStreak || 0;
    const milestones = [
      {
        days: 3,
        icon: '🌟',
        name: 'First Steps',
        unlocked: currentStreak >= 3,
      },
      { days: 7, icon: '✨', name: 'One Week', unlocked: currentStreak >= 7 },
      {
        days: 14,
        icon: '⚡',
        name: 'Two Weeks',
        unlocked: currentStreak >= 14,
      },
      {
        days: 30,
        icon: '🔥',
        name: 'One Month',
        unlocked: currentStreak >= 30,
      },
      {
        days: 60,
        icon: '💎',
        name: 'Diamond Streak',
        unlocked: currentStreak >= 60,
      },
      {
        days: 100,
        icon: '💯',
        name: 'Century',
        unlocked: currentStreak >= 100,
      },
    ];

    return milestones;
  }
}
