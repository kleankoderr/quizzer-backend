import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeService } from '../challenge/challenge.service';
import { QuotaService } from '../common/services/quota.service';
import { UserRole, Prisma } from '@prisma/client';
import {
  UserFilterDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  ContentFilterDto,
  ModerationActionDto,
  CreateSchoolDto,
  UpdateSchoolDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challengeService: ChallengeService,
    private readonly quotaService: QuotaService
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
    const {
      search,
      role,
      isActive,
      isPremium,
      page = '1',
      limit = '10',
    } = filterDto;
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      // Admin search: Check if search is a UUID (exact ID match) or text search
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          search
        );

      if (isUUID) {
        // Exact ID match for admin searching by user ID
        where.id = search;
      } else {
        // Text-based search across name, email, and school name
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { schoolName: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Filter by premium status (active subscription)
    if (isPremium !== undefined) {
      if (isPremium) {
        where.subscription = {
          status: 'ACTIVE',
          currentPeriodEnd: { gte: new Date() },
        };
      } else {
        where.OR = [
          { subscription: null },
          {
            subscription: {
              OR: [
                { status: { not: 'ACTIVE' } },
                { currentPeriodEnd: { lt: new Date() } },
              ],
            },
          },
        ];
      }
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
          subscription: {
            select: {
              status: true,
              currentPeriodEnd: true,
              plan: {
                select: {
                  name: true,
                },
              },
            },
          },
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
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    if (type === 'all') {
      return this.getAllUserContent(userId, skip, limitNum, pageNum);
    }

    let result = { data: [], total: 0 };

    switch (type) {
      case 'quiz':
        result = await this.getQuizzes(userId, skip, limitNum);
        break;
      case 'flashcard':
        result = await this.getFlashcards(userId, skip, limitNum);
        break;
      case 'content':
        result = await this.getContents(userId, skip, limitNum);
        break;
    }

    return {
      data: result.data,
      meta: {
        total: result.total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(result.total / limitNum),
      },
    };
  }

  private async getAllUserContent(
    userId: string,
    skip: number,
    limit: number,
    page: number
  ) {
    const [quizResult, flashcardResult, contentResult] = await Promise.all([
      this.getQuizzes(userId, 0),
      this.getFlashcards(userId, 0),
      this.getContents(userId, 0),
    ]);

    const allData = [
      ...quizResult.data,
      ...flashcardResult.data,
      ...contentResult.data,
    ];

    allData.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = allData.length;
    const data = allData.slice(skip, skip + limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async getQuizzes(userId: string, skip: number, take?: number) {
    const [quizzes, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where: { userId },
        skip,
        take,
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

    return {
      data: quizzes.map((q) => ({ ...q, type: 'quiz' })),
      total,
    };
  }

  private async getFlashcards(userId: string, skip: number, take?: number) {
    const [flashcards, total] = await Promise.all([
      this.prisma.flashcardSet.findMany({
        where: { userId },
        skip,
        take,
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

    return {
      data: flashcards.map((f) => ({ ...f, type: 'flashcard' })),
      total,
    };
  }

  private async getContents(userId: string, skip: number, take?: number) {
    const [contents, total] = await Promise.all([
      this.prisma.content.findMany({
        where: { userId },
        skip,
        take,
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

    return {
      data: contents.map((c) => ({ ...c, type: 'content' })),
      total,
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

    const where: Prisma.QuizWhereInput = {};

    if (search) {
      // Admin search: Search across content AND user information
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
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
      // Admin search: Search across content AND user information
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
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
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
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

  // Subscription Management Methods

  async getSubscriptionStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Get total users and user breakdown
    const [
      totalUsers,
      totalSubscriptions,
      activeSubscriptions,
      canceledSubscriptions,
      newSubscriptionsLast30Days,
      previousMonthSubscriptions,
      canceledLast30Days,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count(),
      this.prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          currentPeriodEnd: { gte: now },
        },
      }),
      this.prisma.subscription.count({
        where: {
          OR: [{ status: 'CANCELLED' }, { cancelAtPeriodEnd: true }],
        },
      }),
      this.prisma.subscription.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.subscription.count({
        where: {
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
      this.prisma.subscription.count({
        where: {
          OR: [{ status: 'CANCELLED' }, { cancelAtPeriodEnd: true }],
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    // Calculate user breakdown
    const premiumUsers = activeSubscriptions; // Users with active subscriptions
    const freeUsers = totalUsers - premiumUsers;

    // Calculate MRR (Monthly Recurring Revenue) and Total Revenue
    const activeSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { gte: now },
      },
      include: { plan: true },
    });

    // Get all historical subscriptions for total revenue
    const allSubscriptions = await this.prisma.subscription.findMany({
      include: { plan: true },
    });

    let mrr = 0;
    let totalRevenue = 0;
    const revenueByPlan = new Map<
      string,
      { planName: string; revenue: number; count: number }
    >();

    for (const sub of activeSubs) {
      if (sub.plan.interval === 'month') {
        mrr += sub.plan.price;
      } else if (sub.plan.interval === 'year') {
        mrr += sub.plan.price / 12; // Convert annual to monthly
      }
    }

    // Calculate total revenue and revenue by plan
    for (const sub of allSubscriptions) {
      totalRevenue += sub.plan.price;

      const planKey = sub.plan.id;
      if (revenueByPlan.has(planKey)) {
        const existing = revenueByPlan.get(planKey);
        revenueByPlan.set(planKey, {
          planName: sub.plan.name,
          revenue: existing.revenue + sub.plan.price,
          count: existing.count + 1,
        });
      } else {
        revenueByPlan.set(planKey, {
          planName: sub.plan.name,
          revenue: sub.plan.price,
          count: 1,
        });
      }
    }

    // Calculate churn rate (canceled in last 30 days / active at start of period)
    const activeAtStartOfPeriod = activeSubscriptions + canceledLast30Days;
    const churnRate =
      activeAtStartOfPeriod > 0
        ? (canceledLast30Days / activeAtStartOfPeriod) * 100
        : 0;

    // Calculate growth rate
    let growthRate = 0;

    if (previousMonthSubscriptions > 0) {
      growthRate =
        ((newSubscriptionsLast30Days - previousMonthSubscriptions) /
          previousMonthSubscriptions) *
        100;
    } else if (newSubscriptionsLast30Days > 0) {
      growthRate = 100;
    }

    // Get subscription growth data for chart
    const growthData = await this.getSubscriptionGrowthData(thirtyDaysAgo, now);

    return {
      // User breakdown
      totalUsers,
      premiumUsers,
      freeUsers,
      premiumPercentage:
        totalUsers > 0
          ? Math.round((premiumUsers / totalUsers) * 100 * 100) / 100
          : 0,

      // Subscription counts
      total: totalSubscriptions,
      active: activeSubscriptions,
      canceled: canceledSubscriptions,
      newLast30Days: newSubscriptionsLast30Days,

      // Revenue metrics
      mrr: Math.round(mrr), // Monthly Recurring Revenue in Naira
      totalRevenue: Math.round(totalRevenue), // All-time revenue in Naira
      revenueByPlan: Array.from(revenueByPlan.values()),

      // Performance metrics
      growthRate: Math.round(growthRate * 100) / 100,
      churnRate: Math.round(churnRate * 100) / 100,

      // Chart data
      growthData,
    };
  }

  async getQuotaStats() {
    // Get all user quotas
    const quotas = await this.prisma.userQuota.findMany({
      select: {
        monthlyQuizCount: true,
        monthlyFlashcardCount: true,
        monthlyStudyMaterialCount: true,
        monthlyConceptExplanationCount: true,
        monthlyFileUploadCount: true,
        totalFileStorageMB: true,
        userId: true,
      },
    });

    // Get premium users count from subscriptions (single source of truth)
    const premiumUsers = await this.prisma.subscription.count({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { gte: new Date() },
      },
    });

    let totalQuizzes = 0;
    let totalFlashcards = 0;
    let totalLearningGuides = 0;
    let totalExplanations = 0;
    let totalFileUploads = 0;
    let totalStorageUsed = 0;

    for (const quota of quotas) {
      totalQuizzes += quota.monthlyQuizCount;
      totalFlashcards += quota.monthlyFlashcardCount;
      totalLearningGuides += quota.monthlyStudyMaterialCount;
      totalExplanations += quota.monthlyConceptExplanationCount;
      totalFileUploads += quota.monthlyFileUploadCount;
      totalStorageUsed += quota.totalFileStorageMB;
    }

    return {
      totalQuizzesGenerated: totalQuizzes,
      totalFlashcardsGenerated: totalFlashcards,
      totalLearningGuidesGenerated: totalLearningGuides,
      totalExplanationsGenerated: totalExplanations,
      totalFileUploads,
      totalStorageUsedMB: Math.round(totalStorageUsed),
      totalStorageUsedGB: Math.round((totalStorageUsed / 1024) * 100) / 100,
      premiumUsers,
      freeUsers: quotas.length - premiumUsers,
    };
  }

  async getAllSubscriptions(filterDto: any) {
    const {
      status,
      planId,
      startDate,
      endDate,
      page = '1',
      limit = '10',
    } = filterDto;
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (planId) {
      where.planId = planId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          plan: true,
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data: subscriptions,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getSubscriptionPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
      include: {
        _count: {
          select: {
            subscriptions: {
              where: {
                status: 'ACTIVE',
              },
            },
          },
        },
      },
    });

    return plans.map((plan) => ({
      ...plan,
      subscriberCount: plan._count.subscriptions,
    }));
  }

  async createSubscriptionPlan(dto: any) {
    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        price: dto.price,
        interval: dto.interval,
        quotas: dto.quotas,
        isActive: dto.isActive !== false, // Default to true
      },
    });

    return plan;
  }

  async updateSubscriptionPlan(id: string, dto: any) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: dto,
    });

    // Note: Cache invalidation will be handled in the controller
    return updated;
  }

  async deleteSubscriptionPlan(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    // Check if plan has active subscriptions
    const activeSubscriptions = await this.prisma.subscription.count({
      where: {
        planId: id,
        status: 'ACTIVE',
        currentPeriodEnd: { gte: new Date() },
      },
    });

    if (activeSubscriptions > 0) {
      // Soft delete: just set isActive to false
      await this.prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        success: true,
        message: `Plan deactivated. ${activeSubscriptions} active subscriptions will continue until their period ends.`,
      };
    } else {
      // Hard delete if no active subscriptions
      await this.prisma.subscriptionPlan.delete({ where: { id } });
      return {
        success: true,
        message: 'Plan deleted successfully',
      };
    }
  }

  private async getSubscriptionGrowthData(startDate: Date, endDate: Date) {
    const subscriptions = await this.prisma.subscription.findMany({
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
    for (const sub of subscriptions) {
      const date = sub.createdAt.toISOString().split('T')[0];
      growthMap.set(date, (growthMap.get(date) || 0) + 1);
    }

    return Array.from(growthMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getUserQuota(userId: string) {
    return this.quotaService.getQuotaStatus(userId);
  }
}
