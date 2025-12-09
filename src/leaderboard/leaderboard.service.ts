import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  async getGlobalLeaderboard(currentUserId: string) {
    const cacheKey = `leaderboard:global:${currentUserId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Get top 11 from Streak table based on totalXP
    const topStreaks = await this.prisma.streak.findMany({
      take: 11,
      orderBy: { totalXP: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            schoolName: true,
          },
        },
      },
    });

    // Check if current user is in top 11
    const currentUserInTop = topStreaks.some((s) => s.userId === currentUserId);
    let currentUserEntry = null;

    if (!currentUserInTop) {
      // Get current user's streak
      const userStreak = await this.prisma.streak.findUnique({
        where: { userId: currentUserId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
              schoolName: true,
            },
          },
        },
      });

      if (userStreak) {
        // Calculate rank
        const rank = await this.prisma.streak.count({
          where: { totalXP: { gt: userStreak.totalXP } },
        });
        currentUserEntry = {
          userId: userStreak.userId,
          userName: userStreak.user.name,
          avatar: userStreak.user.avatar,
          schoolName: userStreak.user.schoolName,
          score: userStreak.totalXP,
          rank: rank + 1,
        };
      }
    }

    const result = {
      entries: topStreaks.map((streak, index) => ({
        userId: streak.userId,
        userName: streak.user.name,
        avatar: streak.user.avatar,
        schoolName: streak.user.schoolName,
        score: streak.totalXP,
        rank: index + 1,
      })),
      currentUser: currentUserEntry
        ? currentUserEntry
        : topStreaks.find((s) => s.userId === currentUserId)
          ? {
              userId: currentUserId,
              userName: topStreaks.find((s) => s.userId === currentUserId)!.user
                .name,
              avatar: topStreaks.find((s) => s.userId === currentUserId)!.user
                .avatar,
              schoolName: topStreaks.find((s) => s.userId === currentUserId)!
                .user.schoolName,
              score: topStreaks.find((s) => s.userId === currentUserId)!
                .totalXP,
              rank: topStreaks.findIndex((s) => s.userId === currentUserId) + 1,
            }
          : null,
    };

    // Cache leaderboard for 1 minute
    await this.cacheManager.set(cacheKey, result, 60000);

    return result;
  }

  async getSchoolLeaderboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { schoolName: true },
    });

    if (!user?.schoolName) {
      return { entries: [], currentUser: null };
    }

    const cacheKey = `leaderboard:school:${user.schoolName}:${userId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Get top 11 in the same school from Streak table
    const topStreaks = await this.prisma.streak.findMany({
      where: {
        user: {
          schoolName: user.schoolName,
        },
      },
      take: 11,
      orderBy: { totalXP: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            schoolName: true,
          },
        },
      },
    });

    // Check if current user is in top 11
    const currentUserInTop = topStreaks.some((s) => s.userId === userId);
    let currentUserEntry = null;

    if (!currentUserInTop) {
      const userStreak = await this.prisma.streak.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
              schoolName: true,
            },
          },
        },
      });

      if (userStreak) {
        const rank = await this.prisma.streak.count({
          where: {
            totalXP: { gt: userStreak.totalXP },
            user: { schoolName: user.schoolName },
          },
        });
        currentUserEntry = {
          userId: userStreak.userId,
          userName: userStreak.user.name,
          avatar: userStreak.user.avatar,
          schoolName: userStreak.user.schoolName,
          score: userStreak.totalXP,
          rank: rank + 1,
        };
      }
    }

    const result = {
      entries: topStreaks.map((streak, index) => ({
        userId: streak.userId,
        userName: streak.user.name,
        avatar: streak.user.avatar,
        schoolName: streak.user.schoolName,
        score: streak.totalXP,
        rank: index + 1,
      })),
      currentUser: currentUserEntry
        ? currentUserEntry
        : topStreaks.find((s) => s.userId === userId)
          ? {
              userId: userId,
              userName: topStreaks.find((s) => s.userId === userId)!.user.name,
              avatar: topStreaks.find((s) => s.userId === userId)!.user.avatar,
              schoolName: topStreaks.find((s) => s.userId === userId)!.user
                .schoolName,
              score: topStreaks.find((s) => s.userId === userId)!.totalXP,
              rank: topStreaks.findIndex((s) => s.userId === userId) + 1,
            }
          : null,
    };

    await this.cacheManager.set(cacheKey, result, 60000);
    return result;
  }

  async updateUserScore(userId: string, pointsToAdd: number) {
    // This method is now deprecated as we use Streak table directly.
    // However, keeping it for compatibility if called elsewhere, but it should ideally update Streak.
    // Since ChallengeService updates Streak directly, we can leave this empty or log a warning.
    // Or better, ensure Streak is updated here too if not already.

    const streak = await this.prisma.streak.findUnique({ where: { userId } });
    if (streak) {
      await this.prisma.streak.update({
        where: { userId },
        data: {
          totalXP: { increment: pointsToAdd },
          lastActivityDate: new Date(),
        },
      });
    } else {
      // Create streak if not exists
      await this.prisma.streak.create({
        data: {
          userId,
          totalXP: pointsToAdd,
          lastActivityDate: new Date(),
        },
      });
    }
  }
}
