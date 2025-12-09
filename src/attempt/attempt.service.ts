import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttemptService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllAttempts(userId: string) {
    return this.prisma.attempt.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
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
        challenge: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
    });
  }

  async getAttemptsByQuiz(quizId: string, userId: string) {
    return this.prisma.attempt.findMany({
      where: { quizId, userId },
      orderBy: { completedAt: 'desc' },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            topic: true,
          },
        },
      },
    });
  }

  async getAttemptsByFlashcard(flashcardSetId: string, userId: string) {
    return this.prisma.attempt.findMany({
      where: { flashcardSetId, userId },
      orderBy: { completedAt: 'desc' },
      include: {
        flashcardSet: {
          select: {
            id: true,
            title: true,
            topic: true,
          },
        },
      },
    });
  }

  async getAttemptById(id: string, userId: string) {
    return this.prisma.attempt.findFirst({
      where: { id, userId },
      include: {
        quiz: true,
        flashcardSet: true,
      },
    });
  }
}
