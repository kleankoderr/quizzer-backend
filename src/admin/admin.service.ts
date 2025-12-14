import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ChallengeService } from '../challenge/challenge.service';
import { UserRole, Prisma } from '@prisma/client';
import {
  UserFilterDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  ContentFilterDto,
  ModerationActionDto,
  CreateSchoolDto,
  UpdateSchoolDto,
  PlatformSettingsDto,
} from './dto/admin.dto';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly challengeService: ChallengeService
  ) {}

  async deleteContent(contentId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException('Content not found');

    await this.prisma.content.delete({ where: { id: contentId } });
    return { success: true, message: 'Content deleted successfully' };
  }

  async deleteQuiz(quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');

    await this.prisma.quiz.delete({ where: { id: quizId } });
    return { success: true, message: 'Quiz deleted successfully' };
  }

  async getSystemStats() {
    const [
      totalUsers,
      activeUsers,
      totalQuizzes,
      totalFlashcards,
      totalAttempts,
      totalContents,
      totalStudyPacks,
      totalDocuments,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.quiz.count(),
      this.prisma.flashcardSet.count(),
      this.prisma.attempt.count(),
      this.prisma.content.count(),
      this.prisma.studyPack.count(),
      this.prisma.document.count(),
    ]);

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newUsersLast7Days = await this.prisma.user.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    const attemptsLast7Days = await this.prisma.attempt.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newLast7Days: newUsersLast7Days,
      },
      content: {
        quizzes: totalQuizzes,
        flashcards: totalFlashcards,
        studyMaterials: totalContents,
        studyPacks: totalStudyPacks,
        documents: totalDocuments,
      },
      engagement: {
        totalAttempts: totalAttempts,
        attemptsLast7Days: attemptsLast7Days,
      },
    };
  }

  async getUsers(filterDto: UserFilterDto) {
    const { search, role, isActive, page = '1', limit = '10' } = filterDto;
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          schoolName: true,
          grade: true,
          createdAt: true,
          _count: {
            select: {
              quizzes: true,
              flashcardSets: true,
              attempts: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        streak: true,
        _count: {
          select: {
            quizzes: true,
            flashcardSets: true,
            attempts: true,
            contents: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get recent activity
    const recentAttempts = await this.prisma.attempt.findMany({
      where: { userId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        quiz: { select: { title: true } },
        flashcardSet: { select: { title: true } },
      },
    });

    return {
      ...user,
      recentActivity: recentAttempts,
    };
  }

  async getUserContent(userId: string, filterDto: ContentFilterDto) {
    const { type = 'all', page = '1', limit = '10' } = filterDto;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    let data: any[] = [];
    let total = 0;

    if (type === 'quiz' || type === 'all') {
      const [quizzes, quizCount] = await Promise.all([
        this.prisma.quiz.findMany({
          where: { userId },
          skip: type === 'quiz' ? skip : 0,
          take: type === 'quiz' ? limitNum : undefined,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            topic: true,
            difficulty: true,
            createdAt: true,
            _count: { select: { attempts: true } },
          },
        }),
        this.prisma.quiz.count({ where: { userId } }),
      ]);

      if (type === 'quiz') {
        data = quizzes.map((q) => ({ ...q, type: 'quiz' }));
        total = quizCount;
      } else {
        data.push(...quizzes.map((q) => ({ ...q, type: 'quiz' })));
      }
    }

    if (type === 'flashcard' || type === 'all') {
      const [flashcards, flashcardCount] = await Promise.all([
        this.prisma.flashcardSet.findMany({
          where: { userId },
          skip: type === 'flashcard' ? skip : 0,
          take: type === 'flashcard' ? limitNum : undefined,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            topic: true,
            createdAt: true,
            _count: { select: { attempts: true } },
          },
        }),
        this.prisma.flashcardSet.count({ where: { userId } }),
      ]);

      if (type === 'flashcard') {
        data = flashcards.map((f) => ({ ...f, type: 'flashcard' }));
        total = flashcardCount;
      } else {
        data.push(...flashcards.map((f) => ({ ...f, type: 'flashcard' })));
      }
    }

    if (type === 'content' || type === 'all') {
      const [contents, contentCount] = await Promise.all([
        this.prisma.content.findMany({
          where: { userId },
          skip: type === 'content' ? skip : 0,
          take: type === 'content' ? limitNum : undefined,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            topic: true,
            createdAt: true,
          },
        }),
        this.prisma.content.count({ where: { userId } }),
      ]);

      if (type === 'content') {
        data = contents.map((c) => ({ ...c, type: 'content' }));
        total = contentCount;
      } else {
        data.push(...contents.map((c) => ({ ...c, type: 'content' })));
      }
    }

    // If type is "all", sort by createdAt and paginate
    if (type === 'all') {
      data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      total = data.length;
      data = data.slice(skip, skip + limitNum);
    }

    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async updateUserStatus(userId: string, updateStatusDto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Prevent disabling Super Admin
    if (user.role === UserRole.SUPER_ADMIN && !updateStatusDto.isActive) {
      throw new ForbiddenException('Cannot disable Super Admin account');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: updateStatusDto.isActive },
    });
  }

  async updateUserRole(userId: string, updateRoleDto: UpdateUserRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: updateRoleDto.role },
    });
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot delete Super Admin account');
    }

    // Use transaction to ensure all related data is deleted properly
    return this.prisma.$transaction(async (tx) => {
      // Delete user (cascade will handle related records)
      return tx.user.delete({ where: { id: userId } });
    });
  }

  async getAllContent(filterDto: ContentFilterDto) {
    const { search, page = '1', limit = '10' } = filterDto;
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // This is a simplified aggregation of content.
    // In the future, you might want separate endpoints or a union query.
    // For now, let's return quizzes and flashcards separately or combined if needed.
    // Let's focus on Quizzes for now as primary content.

    const where: Prisma.QuizWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [quizzes, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          _count: { select: { attempts: true } },
        },
      }),
      this.prisma.quiz.count({ where }),
    ]);

    return {
      data: quizzes,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getAllFlashcards(filterDto: ContentFilterDto) {
    const { search, page = '1', limit = '10' } = filterDto;
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.FlashcardSetWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [flashcards, total] = await Promise.all([
      this.prisma.flashcardSet.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          _count: { select: { attempts: true } },
        },
      }),
      this.prisma.flashcardSet.count({ where }),
    ]);

    return {
      data: flashcards,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getAllChallenges(filterDto: ContentFilterDto) {
    const { search, page = '1', limit = '10' } = filterDto;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.ChallengeWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [challenges, total] = await Promise.all([
      this.prisma.challenge.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { completions: true } },
        },
      }),
      this.prisma.challenge.count({ where }),
    ]);

    return {
      data: challenges,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getReportedContent() {
    return this.prisma.report.findMany({
      include: {
        user: { select: { name: true, email: true } },
        content: { select: { title: true } },
        quiz: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async moderateContent(id: string, actionDto: ModerationActionDto) {
    // id is contentId or quizId.
    // We need to find reports associated with this content and resolve them.
    // And perform the action.

    if (actionDto.action === 'DELETE') {
      // Try to delete from Quiz or Content
      // This is a bit ambiguous without knowing the type.
      // For now, we try both or rely on the fact that IDs are UUIDs and unique across tables (usually not guaranteed but likely distinct enough or we check existence).
      // Better approach: The UI should pass the type or we check.
      // Let's check existence.
      const quiz = await this.prisma.quiz.findUnique({ where: { id } });
      if (quiz) {
        await this.prisma.quiz.delete({ where: { id } });
      } else {
        const content = await this.prisma.content.findUnique({ where: { id } });
        if (content) {
          await this.prisma.content.delete({ where: { id } });
        }
      }
    }

    // Resolve reports
    await this.prisma.report.updateMany({
      where: { OR: [{ quizId: id }, { contentId: id }] },
      data: { status: 'RESOLVED' },
    });

    return { success: true };
  }

  async getSchools() {
    return this.prisma.school.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createSchool(dto: CreateSchoolDto) {
    return this.prisma.school.create({ data: dto });
  }

  async updateSchool(id: string, dto: UpdateSchoolDto) {
    return this.prisma.school.update({ where: { id }, data: dto });
  }

  async getAiAnalytics() {
    const totalTasks = await this.prisma.task.count();
    const failedTasks = await this.prisma.task.count({
      where: { status: 'FAILED' },
    });

    // Get tasks by type
    const tasksByType = await this.prisma.task.groupBy({
      by: ['type'],
      _count: { _all: true },
    });

    return {
      totalGenerations: totalTasks,
      failedGenerations: failedTasks,
      successRate:
        totalTasks > 0 ? ((totalTasks - failedTasks) / totalTasks) * 100 : 0,
      breakdown: tasksByType.map((t) => ({
        type: t.type,
        count: t._count._all,
      })),
    };
  }

  async getSettings() {
    const settings = await this.prisma.platformSettings.findFirst();
    if (!settings) {
      return this.prisma.platformSettings.create({
        data: { allowRegistration: true, maintenanceMode: false },
      });
    }
    return settings;
  }

  async updateSettings(dto: PlatformSettingsDto) {
    const settings = await this.prisma.platformSettings.findFirst();
    if (settings) {
      return this.prisma.platformSettings.update({
        where: { id: settings.id },
        data: dto,
      });
    } else {
      return this.prisma.platformSettings.create({ data: dto });
    }
  }

  async deleteFlashcardSet(flashcardSetId: string) {
    const flashcardSet = await this.prisma.flashcardSet.findUnique({
      where: { id: flashcardSetId },
    });
    if (!flashcardSet) throw new NotFoundException('Flashcard set not found');

    await this.prisma.flashcardSet.delete({ where: { id: flashcardSetId } });
    return { success: true, message: 'Flashcard set deleted successfully' };
  }

  async createChallenge(dto: any) {
    const { quizIds, ...challengeData } = dto;

    // Create challenge
    const challenge = await this.prisma.challenge.create({
      data: {
        ...challengeData,
        startDate: new Date(challengeData.startDate),
        endDate: new Date(challengeData.endDate),
      },
    });

    // If quizIds provided, create challenge-quiz associations
    if (quizIds && quizIds.length > 0) {
      await Promise.all(
        quizIds.map((quizId: string, index: number) =>
          this.prisma.challengeQuiz.create({
            data: {
              challengeId: challenge.id,
              quizId,
              order: index,
            },
          })
        )
      );
    }

    return challenge;
  }

  async deleteChallenge(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');

    await this.prisma.challenge.delete({ where: { id: challengeId } });
    return { success: true, message: 'Challenge deleted successfully' };
  }

  async getAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // User analytics
    const [
      totalUsers,
      activeUsers,
      newUsersLast30Days,
      newUsersLast7Days,
      usersByRole,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
      }),
    ]);

    // Content analytics
    const [
      totalQuizzes,
      totalFlashcards,
      totalContents,
      totalChallenges,
      quizzesLast30Days,
      flashcardsLast30Days,
    ] = await Promise.all([
      this.prisma.quiz.count(),
      this.prisma.flashcardSet.count(),
      this.prisma.content.count(),
      this.prisma.challenge.count(),
      this.prisma.quiz.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.flashcardSet.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    // Engagement analytics
    const [
      totalAttempts,
      attemptsLast30Days,
      attemptsLast7Days,
      attemptsByType,
      avgQuizScore,
    ] = await Promise.all([
      this.prisma.attempt.count(),
      this.prisma.attempt.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.attempt.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.attempt.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      this.prisma.attempt.aggregate({
        where: { type: 'quiz', score: { not: null } },
        _avg: { score: true },
      }),
    ]);

    // Challenge analytics
    const [
      activeChallenges,
      completedChallenges,
      challengeParticipation,
      topChallenges,
    ] = await Promise.all([
      this.prisma.challenge.count({
        where: {
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
      this.prisma.challengeCompletion.count({ where: { completed: true } }),
      this.prisma.challengeCompletion.count(),
      this.prisma.challenge.findMany({
        take: 5,
        orderBy: { completions: { _count: 'desc' } },
        include: {
          _count: { select: { completions: true } },
        },
      }),
    ]);

    // Top performing content
    const topQuizzes = await this.prisma.quiz.findMany({
      take: 5,
      orderBy: { attempts: { _count: 'desc' } },
      include: {
        user: { select: { name: true } },
        _count: { select: { attempts: true } },
      },
    });

    const topFlashcards = await this.prisma.flashcardSet.findMany({
      take: 5,
      orderBy: { attempts: { _count: 'desc' } },
      include: {
        user: { select: { name: true } },
        _count: { select: { attempts: true } },
      },
    });

    // User growth over time (last 30 days)
    const userGrowth = await this.getUserGrowthData(thirtyDaysAgo, now);

    // Content creation trends (last 30 days)
    const contentTrends = await this.getContentTrendsData(thirtyDaysAgo, now);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        newLast30Days: newUsersLast30Days,
        newLast7Days: newUsersLast7Days,
        byRole: usersByRole.map((r) => ({
          role: r.role,
          count: r._count._all,
        })),
        growth: userGrowth,
      },
      content: {
        quizzes: totalQuizzes,
        flashcards: totalFlashcards,
        studyMaterials: totalContents,
        challenges: totalChallenges,
        quizzesLast30Days,
        flashcardsLast30Days,
        trends: contentTrends,
        topQuizzes: topQuizzes.map((q) => ({
          id: q.id,
          title: q.title,
          topic: q.topic,
          creator: q.user.name,
          attempts: q._count.attempts,
        })),
        topFlashcards: topFlashcards.map((f) => ({
          id: f.id,
          title: f.title,
          topic: f.topic,
          creator: f.user.name,
          attempts: f._count.attempts,
        })),
      },
      engagement: {
        totalAttempts,
        attemptsLast30Days,
        attemptsLast7Days,
        byType: attemptsByType.map((a) => ({
          type: a.type,
          count: a._count._all,
        })),
        avgQuizScore: avgQuizScore._avg.score || 0,
      },
      challenges: {
        active: activeChallenges,
        totalCompletions: completedChallenges,
        totalParticipations: challengeParticipation,
        completionRate:
          challengeParticipation > 0
            ? (completedChallenges / challengeParticipation) * 100
            : 0,
        topChallenges: topChallenges.map((c) => ({
          id: c.id,
          title: c.title,
          type: c.type,
          participants: c._count.completions,
        })),
      },
    };
  }

  private async getUserGrowthData(startDate: Date, endDate: Date) {
    const users = await this.prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: { createdAt: true },
    });

    // Group by date
    const growthMap = new Map<string, number>();
    for (const user of users) {
      const date = user.createdAt.toISOString().split('T')[0];
      growthMap.set(date, (growthMap.get(date) || 0) + 1);
    }

    return Array.from(growthMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getContentTrendsData(startDate: Date, endDate: Date) {
    const [quizzes, flashcards, contents] = await Promise.all([
      this.prisma.quiz.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { createdAt: true },
      }),
      this.prisma.flashcardSet.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { createdAt: true },
      }),
      this.prisma.content.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { createdAt: true },
      }),
    ]);

    const trendsMap = new Map<
      string,
      { quizzes: number; flashcards: number; contents: number }
    >();

    for (const q of quizzes) {
      const date = q.createdAt.toISOString().split('T')[0];
      const existing = trendsMap.get(date) || {
        quizzes: 0,
        flashcards: 0,
        contents: 0,
      };
      trendsMap.set(date, { ...existing, quizzes: existing.quizzes + 1 });
    }

    for (const f of flashcards) {
      const date = f.createdAt.toISOString().split('T')[0];
      const existing = trendsMap.get(date) || {
        quizzes: 0,
        flashcards: 0,
        contents: 0,
      };
      trendsMap.set(date, { ...existing, flashcards: existing.flashcards + 1 });
    }

    for (const c of contents) {
      const date = c.createdAt.toISOString().split('T')[0];
      const existing = trendsMap.get(date) || {
        quizzes: 0,
        flashcards: 0,
        contents: 0,
      };
      trendsMap.set(date, { ...existing, contents: existing.contents + 1 });
    }

    return Array.from(trendsMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async generateDailyChallenges() {
    await this.challengeService.generateDailyChallenges();
    return {
      success: true,
      message: 'Daily challenges generated successfully',
    };
  }

  async generateWeeklyChallenges() {
    await this.challengeService.generateWeeklyChallenges();
    return {
      success: true,
      message: 'Weekly challenges generated successfully',
    };
  }

  async generateMonthlyChallenges() {
    await this.challengeService.generateMonthlyChallenges();
    return {
      success: true,
      message: 'Monthly challenges generated successfully',
    };
  }

  async generateHotChallenges() {
    await this.challengeService.generateHotChallenges();
    return { success: true, message: 'Hot challenges generated successfully' };
  }
}
