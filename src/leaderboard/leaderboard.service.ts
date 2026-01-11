import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService
  ) {}

  async getGlobalLeaderboard(currentUserId: string) {
    const cacheKey = `leaderboard:global:${currentUserId}`;
    const cached = await this.cacheService.get(cacheKey);

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
            profile: {
              select: {
                name: true,
                avatar: true,
                schoolName: true,
              },
            },
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
              profile: {
                select: {
                  name: true,
                  avatar: true,
                  schoolName: true,
                },
              },
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
          userName: userStreak.user.profile?.name,
          avatar: userStreak.user.profile?.avatar,
          schoolName: userStreak.user.profile?.schoolName,
          score: userStreak.totalXP,
          rank: rank + 1,
        };
      }
    }

    const result = {
      entries: topStreaks.map((streak, index) => ({
        userId: streak.userId,
        userName: streak.user.profile?.name,
        avatar: streak.user.profile?.avatar,
        schoolName: streak.user.profile?.schoolName,
        score: streak.totalXP,
        rank: index + 1,
      })),
      currentUser: currentUserEntry
        ? currentUserEntry
        : (() => {
            const currentStreak = topStreaks.find(
              (s) => s.userId === currentUserId
            );
            return currentStreak
              ? {
                  userId: currentUserId,
                  userName: currentStreak.user.profile?.name,
                  avatar: currentStreak.user.profile?.avatar,
                  schoolName: currentStreak.user.profile?.schoolName,
                  score: currentStreak.totalXP,
                  rank:
                    topStreaks.findIndex((s) => s.userId === currentUserId) + 1,
                }
              : null;
          })(),
    };

    // Cache leaderboard for 5 minutes (reduced database load)
    await this.cacheService.set(cacheKey, result, 300000);

    return result;
  }

  async getSchoolLeaderboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { schoolName: true } } },
    });

    if (!user?.profile?.schoolName) {
      return { entries: [], currentUser: null };
    }

    const cacheKey = `leaderboard:school:${user.profile.schoolName}:${userId}`;
    const cached = await this.cacheService.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Get top 11 in the same school from Streak table
    const topStreaks = await this.prisma.streak.findMany({
      where: {
        user: {
          profile: {
            schoolName: user.profile.schoolName,
          },
        },
      },
      take: 11,
      orderBy: { totalXP: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                name: true,
                avatar: true,
                schoolName: true,
              },
            },
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
              profile: {
                select: {
                  name: true,
                  avatar: true,
                  schoolName: true,
                },
              },
            },
          },
        },
      });

      if (userStreak) {
        const rank = await this.prisma.streak.count({
          where: {
            totalXP: { gt: userStreak.totalXP },
            user: { profile: { schoolName: user.profile.schoolName } },
          },
        });
        currentUserEntry = {
          userId: userStreak.userId,
          userName: userStreak.user.profile?.name,
          avatar: userStreak.user.profile?.avatar,
          schoolName: userStreak.user.profile?.schoolName,
          score: userStreak.totalXP,
          rank: rank + 1,
        };
      }
    }

    const result = {
      entries: topStreaks.map((streak, index) => ({
        userId: streak.userId,
        userName: streak.user.profile?.name,
        avatar: streak.user.profile?.avatar,
        schoolName: streak.user.profile?.schoolName,
        score: streak.totalXP,
        rank: index + 1,
      })),
      currentUser: currentUserEntry
        ? currentUserEntry
        : (() => {
            const currentStreak = topStreaks.find((s) => s.userId === userId);
            return currentStreak
              ? {
                  userId: userId,
                  userName: currentStreak.user.profile?.name,
                  avatar: currentStreak.user.profile?.avatar,
                  schoolName: currentStreak.user.profile?.schoolName,
                  score: currentStreak.totalXP,
                  rank: topStreaks.findIndex((s) => s.userId === userId) + 1,
                }
              : null;
          })(),
    };

    await this.cacheService.set(cacheKey, result, 300000); // 5 minutes
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
