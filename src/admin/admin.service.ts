import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole, Prisma } from "@prisma/client";
import {
  UserFilterDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  ContentFilterDto,
  ModerationActionDto,
  CreateSchoolDto,
  UpdateSchoolDto,
  PlatformSettingsDto,
} from "./dto/admin.dto";
import { ForbiddenException } from "@nestjs/common";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteContent(contentId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException("Content not found");

    await this.prisma.content.delete({ where: { id: contentId } });
    return { success: true, message: "Content deleted successfully" };
  }

  async deleteQuiz(quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException("Quiz not found");

    await this.prisma.quiz.delete({ where: { id: quizId } });
    return { success: true, message: "Quiz deleted successfully" };
  }

  async getSystemStats() {
    const [
      totalUsers,
      activeUsers,
      totalQuizzes,
      totalFlashcards,
      totalAttempts,
      totalContents,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.quiz.count(),
      this.prisma.flashcardSet.count(),
      this.prisma.attempt.count(),
      this.prisma.content.count(),
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
      },
      engagement: {
        totalAttempts: totalAttempts,
        attemptsLast7Days: attemptsLast7Days,
      },
    };
  }

  async getUsers(filterDto: UserFilterDto) {
    const { search, role, isActive, page = "1", limit = "10" } = filterDto;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
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
        orderBy: { createdAt: "desc" },
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
      throw new NotFoundException("User not found");
    }

    // Get recent activity
    const recentAttempts = await this.prisma.attempt.findMany({
      where: { userId },
      take: 5,
      orderBy: { createdAt: "desc" },
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

  async updateUserStatus(userId: string, updateStatusDto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    // Prevent disabling Super Admin
    if (user.role === UserRole.SUPER_ADMIN && !updateStatusDto.isActive) {
      throw new ForbiddenException("Cannot disable Super Admin account");
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: updateStatusDto.isActive },
    });
  }

  async updateUserRole(userId: string, updateRoleDto: UpdateUserRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: updateRoleDto.role },
    });
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Cannot delete Super Admin account");
    }

    return this.prisma.user.delete({ where: { id: userId } });
  }

  async getAllContent(filterDto: ContentFilterDto) {
    const { search, type, page = "1", limit = "10" } = filterDto;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // This is a simplified aggregation of content.
    // In a real scenario, you might want separate endpoints or a union query.
    // For now, let's return quizzes and flashcards separately or combined if needed.
    // Let's focus on Quizzes for now as primary content.

    const where: Prisma.QuizWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { topic: { contains: search, mode: "insensitive" } },
      ];
    }

    const [quizzes, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
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

  async getReportedContent() {
    return this.prisma.report.findMany({
      include: {
        user: { select: { name: true, email: true } },
        content: { select: { title: true } },
        quiz: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async moderateContent(id: string, actionDto: ModerationActionDto) {
    // id is contentId or quizId.
    // We need to find reports associated with this content and resolve them.
    // And perform the action.

    if (actionDto.action === "DELETE") {
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
      data: { status: "RESOLVED" },
    });

    return { success: true };
  }

  async getSchools() {
    return this.prisma.school.findMany({
      orderBy: { name: "asc" },
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
      where: { status: "FAILED" },
    });
    const completedTasks = await this.prisma.task.count({
      where: { status: "COMPLETED" },
    });

    // Get tasks by type
    const tasksByType = await this.prisma.task.groupBy({
      by: ["type"],
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
}
