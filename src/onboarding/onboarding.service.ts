import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { QuizType, TaskStatus, TaskType } from '@prisma/client';
import { QuizGenerationSchema } from '../langchain/schemas/quiz.schema';
import { AiPrompts } from '../ai/ai.prompts';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService
  ) {}

  async getUserPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    return user?.preferences;
  }

  async saveUserPreferences(userId: string, data: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { preferences: data },
    });
  }

  async generateAssessment(userId: string, topic?: string) {
    try {
      // Get user preferences
      const preferences = (await this.getUserPreferences(userId)) as any;
      const userTopic =
        topic || preferences?.interests?.[0] || 'General Knowledge';

      // Check if user already has an active task for this
      const existingTask = await this.prisma.task.findFirst({
        where: {
          userId,
          type: TaskType.ONBOARDING_ASSESSMENT,
          status: TaskStatus.PENDING,
        },
      });

      if (existingTask) {
        return existingTask;
      }

      // Create a task record
      const task = await this.prisma.task.create({
        data: {
          userId,
          type: TaskType.ONBOARDING_ASSESSMENT,
          status: TaskStatus.PENDING,
          result: { topic: userTopic },
        },
      });

      // Generate quiz using AI
      const prompt = AiPrompts.generateQuiz(
        userTopic,
        5,
        'medium',
        'standard',
        'single-select, true-false',
        ''
      );

      const generatedQuiz = await this.langchainService.invokeWithStructure(
        QuizGenerationSchema,
        prompt,
        {
          task: 'quiz',
          complexity: 'simple',
        }
      );

      // Save quiz to DB
      const quiz = await this.prisma.quiz.create({
        data: {
          title: `Assessment: ${userTopic}`,
          topic: userTopic,
          difficulty: 'medium',
          quizType: QuizType.STANDARD,
          userId,
          questions: generatedQuiz.questions.map((q: any) => ({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty || 'medium',
          })),
        },
      });

      // Link quiz to task
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.COMPLETED,
          result: {
            ...((task.result as any) || {}),
            quizId: quiz.id,
          },
        },
      });

      return quiz;
    } catch (error) {
      this.logger.error('Error generating onboarding assessment:', error);
      throw error;
    }
  }

  async completeOnboarding(userId: string) {
    try {
      // Mark onboarding as complete in user profile
      await this.prisma.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      });

      // Trigger assessment generation in the background
      this.generateAssessment(userId).catch((err) =>
        this.logger.error(
          `Failed to trigger onboarding assessment: ${err.message}`
        )
      );

      return { success: true };
    } catch (error) {
      this.logger.error('Error completing onboarding:', error);
      throw error;
    }
  }

  async checkAssessmentStatus(userId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        userId,
        type: TaskType.ONBOARDING_ASSESSMENT,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!task) {
      return { status: 'NOT_FOUND' };
    }

    return {
      status: task.status,
      quizId: (task.result as any)?.quizId,
      error: task.error,
    };
  }
}
