import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAdminQuizDto, UpdateAdminQuizDto } from './dto/admin-quiz.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { QuizService } from '../quiz.service';
import { ContentScope } from '@prisma/client';

@Injectable()
export class AdminQuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quizService: QuizService
  ) {}

  async createAdminQuiz(
    userId: string,
    dto: CreateAdminQuizDto,
    files?: Express.Multer.File[]
  ) {
    const adminContext = {
      scope: dto.scope,
      schoolId: dto.schoolId,
      isActive: dto.isActive,
    };
    return this.quizService.generateQuiz(userId, dto, files, adminContext);
  }

  async findAllAdminQuizzes(
    page: number = 1,
    limit: number = 20,
    scope?: ContentScope,
    schoolId?: string
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (scope) where.scope = scope;
    if (schoolId) where.schoolId = schoolId;

    const [quizzes, total] = await Promise.all([
      this.prisma.adminQuiz.findMany({
        where,
        include: {
          quiz: {
            select: {
              title: true,
              topic: true,
              difficulty: true,
              quizType: true,
              questions: true,
              _count: { select: { attempts: true } },
            },
          },
          creator: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminQuiz.count({ where }),
    ]);

    return {
      data: quizzes.map((aq) => ({
        id: aq.id,
        quizId: aq.quizId,
        title: aq.quiz.title,
        topic: aq.quiz.topic,
        scope: aq.scope,
        schoolId: aq.schoolId,
        isActive: aq.isActive,
        creator: aq.creator,
        questionCount: (aq.quiz.questions as any[]).length,
        attemptCount: aq.quiz._count.attempts,
        createdAt: aq.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminQuizById(id: string) {
    const adminQuiz = await this.prisma.adminQuiz.findUnique({
      where: { id },
      include: {
        quiz: true,
        creator: {
          select: { id: true, name: true, email: true },
        },
        school: true,
      },
    });

    if (!adminQuiz) {
      throw new NotFoundException('Admin Quiz not found');
    }

    return adminQuiz;
  }

  async updateAdminQuiz(id: string, dto: UpdateAdminQuizDto) {
    const adminQuiz = await this.prisma.adminQuiz.findUnique({ where: { id } });
    if (!adminQuiz) throw new NotFoundException('Admin Quiz not found');

    if (dto.title || dto.topic) {
      await this.prisma.quiz.update({
        where: { id: adminQuiz.quizId },
        data: {
          title: dto.title,
          topic: dto.topic,
        },
      });
    }

    // Update Admin fields
    return this.prisma.adminQuiz.update({
      where: { id },
      data: {
        scope: dto.scope,
        schoolId: dto.schoolId,
        isActive: dto.isActive,
      },
    });
  }

  async deleteAdminQuiz(id: string) {
    const adminQuiz = await this.prisma.adminQuiz.findUnique({ where: { id } });
    if (!adminQuiz) throw new NotFoundException('Admin Quiz not found');
    return this.quizService.deleteQuiz(adminQuiz.quizId, adminQuiz.createdBy);
  }
}
