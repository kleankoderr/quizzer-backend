import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { QuizType, TaskStatus, TaskType } from '@prisma/client';

import { SchoolService } from '../school/school.service';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly schoolService: SchoolService
  ) {}

  async savePreferences(
    userId: string,
    data: {
      grade?: string;
      schoolName?: string;
      subjects?: string[];
      userType?: string;
    }
  ) {
    const { grade, schoolName, subjects, userType } = data;

    let schoolId = undefined;
    if (schoolName) {
      const school = await this.schoolService.findOrCreate(schoolName);
      schoolId = school.id;
    }

    // Update user profile
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        grade,
        schoolName,
        schoolId,
        preferences: {
          subjects,
          userType,
        },
      },
    });

    // Trigger async assessment generation
    await this.triggerAssessmentGeneration(userId, subjects || []);

    return { message: 'Preferences saved and assessment generation started' };
  }

  async triggerAssessmentGeneration(userId: string, subjects: string[]) {
    this.logger.log(`Triggering assessment generation for user ${userId}`);

    // Check if a task already exists for this user
    const existingTask = await this.prisma.task.findFirst({
      where: {
        userId,
        type: TaskType.ONBOARDING_ASSESSMENT,
      },
    });

    if (existingTask) {
      this.logger.log(
        `Assessment generation already triggered for user ${userId}`
      );
      return existingTask;
    }

    // Create a task record to track progress
    const task = await this.prisma.task.create({
      data: {
        userId,
        type: TaskType.ONBOARDING_ASSESSMENT,
        status: TaskStatus.PENDING,
      },
    });

    // Run async generation (fire and forget from controller perspective, but tracked via Task)
    this.generateAssessment(userId, subjects, task.id).catch((err) => {
      this.logger.error(
        `Error generating assessment for user ${userId}: ${err.message}`
      );
      this.prisma.task
        .update({
          where: { id: task.id },
          data: { status: TaskStatus.FAILED, error: err.message },
        })
        .catch((e) =>
          this.logger.error(`Failed to update task status: ${e.message}`)
        );
    });

    return task;
  }

  private async generateAssessment(
    userId: string,
    subjects: string[],
    taskId: string
  ) {
    try {
      // Determine topic based on subjects or default
      const topic =
        subjects.length > 0
          ? `General Knowledge Assessment (${subjects.slice(0, 3).join(', ')})`
          : 'General Knowledge Assessment';

      // Generate quiz using AI
      const generatedQuiz = await this.aiService.generateQuiz({
        topic,
        numberOfQuestions: 5,
        difficulty: 'medium',
        quizType: 'standard',
        questionTypes: ['single-select', 'true-false'],
      });

      // Save quiz to DB
      const quiz = await this.prisma.quiz.create({
        data: {
          title: 'Personalized Assessment',
          topic: 'Assessment',
          difficulty: 'medium',
          quizType: QuizType.STANDARD, // Using STANDARD as it's a normal quiz for now
          questions: generatedQuiz.questions as any,
          userId,
          tags: ['Onboarding', 'New'],
          timeLimit: 300, // 5 minutes
        },
      });

      // Update task status
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          result: { quizId: quiz.id },
        },
      });

      this.logger.log(`Assessment generated successfully for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to generate assessment: ${error.message}`);
      throw error;
    }
  }

  async checkAssessmentStatus(userId: string) {
    // First check if user has completed onboarding
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true },
    });

    const task = await this.prisma.task.findFirst({
      where: {
        userId,
        type: 'ONBOARDING_ASSESSMENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!task) {
      if (user?.onboardingCompleted) {
        return { status: TaskStatus.COMPLETED, quizId: null };
      }
      return { status: 'NOT_STARTED' };
    }

    return {
      status: task.status,
      quizId: task.result ? (task.result as any).quizId : null,
    };
  }

  async completeOnboarding(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
  }
}
