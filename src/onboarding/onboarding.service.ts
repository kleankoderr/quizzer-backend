import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { QuizType, TaskStatus, TaskType } from '@prisma/client';
import { LangChainPrompts } from '../langchain/prompts';
import { QuizUtils } from '../quiz/quiz.utils';

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

      // Extract subjects from preferences, fallback to interests or General Knowledge
      const subjects = preferences?.subjects ||
        preferences?.interests || ['General Knowledge'];

      const userTopic =
        topic ||
        (Array.isArray(subjects) ? subjects.join(', ') : subjects) ||
        'General Knowledge';

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
      const prompt = LangChainPrompts.generateQuiz(
        userTopic,
        10,
        'Medium',
        'standard',
        'single-select, true-false',
        ''
      );

      const generatedQuiz = await this.langchainService.invokeWithJsonParser(
        prompt,
        {
          task: 'quiz',
        }
      );

      // Save quiz to DB
      const quiz = await this.prisma.quiz.create({
        data: {
          title: 'Onboarding Assessment',
          topic: generatedQuiz.topic || userTopic,
          difficulty: 'medium',
          quizType: QuizType.STANDARD,
          userId,
          questions: QuizUtils.normalizeQuestions(generatedQuiz.questions),
        },
      });

      // Link quiz to task
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.COMPLETED,
          result: {
            ...(task.result as any),
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
