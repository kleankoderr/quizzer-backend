import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
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
    schoolId?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (scope) where.scope = scope;
    if (schoolId) where.schoolId = schoolId;
    if (search) {
      where.quiz = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { topic: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

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
    const adminQuiz = await this.prisma.adminQuiz.findUnique({
      where: { id },
    });
    if (!adminQuiz) throw new NotFoundException('Admin Quiz not found');

    if (dto.title || dto.topic || dto.questions || dto.deletedQuestionIds) {
      const quiz = await this.prisma.quiz.findUnique({
        where: { id: adminQuiz.quizId },
      });
      let currentQuestions = (quiz?.questions as any[]) || [];

      // 1. Handle Deletions
      if (dto.deletedQuestionIds?.length) {
        currentQuestions = currentQuestions.filter(
          (q) => !dto.deletedQuestionIds?.includes(q.id)
        );
      }

      // 2. Handle Updates and Additions
      if (dto.questions?.length) {
        dto.questions.forEach((updatedQ) => {
          const existingIdx = currentQuestions.findIndex(
            (q) => q.id === updatedQ.id
          );
          if (existingIdx >= 0) {
            // Update existing
            currentQuestions[existingIdx] = {
              ...currentQuestions[existingIdx],
              ...updatedQ,
            };
          } else {
            // Add new (ensure it has an ID if frontend didn't provide one)
            currentQuestions.unshift({
              ...updatedQ,
              id: updatedQ.id || uuidv4(),
            });
          }
        });
      }

      const updateData: any = {};
      if (dto.title) updateData.title = dto.title;
      if (dto.topic) updateData.topic = dto.topic;
      updateData.questions = currentQuestions;

      await this.prisma.quiz.update({
        where: { id: adminQuiz.quizId },
        data: updateData,
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

  async deleteQuestions(id: string, questionIds: string[]) {
    const adminQuiz = await this.prisma.adminQuiz.findUnique({
      where: { id },
    });
    if (!adminQuiz) throw new NotFoundException('Admin Quiz not found');

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: adminQuiz.quizId },
    });
    if (!quiz) throw new NotFoundException('Quiz content not found');

    const questions = (quiz.questions as any[]) || [];
    const updatedQuestions = questions.filter(
      (q) => !questionIds.includes(q.id)
    );

    if (questions.length === updatedQuestions.length) {
      return {
        success: true,
        message: 'Questions updated successfully',
      };
    }

    await this.prisma.quiz.update({
      where: { id: adminQuiz.quizId },
      data: { questions: updatedQuestions },
    });

    return {
      success: true,
      message: `${questions.length - updatedQuestions.length} questions deleted successfully`,
    };
  }
}
