import { Injectable, NotFoundException, Logger, Inject } from "@nestjs/common";

import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { PrismaService } from "../prisma/prisma.service";
import { RecommendationService } from "../recommendation/recommendation.service";
import { StreakService } from "../streak/streak.service";
import { ChallengeService } from "../challenge/challenge.service";
import { StudyService } from "../study/study.service";
import { GenerateQuizDto, SubmitQuizDto } from "./dto/quiz.dto";
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from "../file-storage/interfaces/file-storage.interface";

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    @InjectQueue("quiz-generation") private readonly quizQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly recommendationService: RecommendationService,
    private readonly streakService: StreakService,
    private readonly challengeService: ChallengeService,
    private readonly studyService: StudyService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly fileStorageService: IFileStorageService
  ) {}

  async generateQuiz(
    userId: string,
    dto: GenerateQuizDto,
    files?: Express.Multer.File[]
  ) {
    this.logger.log(
      `User ${userId} requesting quiz generation: ${dto.numberOfQuestions} questions, difficulty: ${dto.difficulty}`
    );

    // Upload files to Cloudinary and prepare data for queue
    const fileData = [];
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const uploadResult = await this.fileStorageService.uploadFile(file, {
            folder: "quizzer/quizzes",
            resourceType: "auto",
          });

          fileData.push({
            path: file.path,
            originalname: file.originalname,
            mimetype: file.mimetype,
            url: uploadResult.secureUrl,
            publicId: uploadResult.publicId,
          });
        } catch (error) {
          this.logger.error(
            `Failed to upload file ${file.originalname}:`,
            error
          );
          throw new Error(`Failed to upload file: ${file.originalname}`);
        }
      }
    }

    // Add job to queue
    const job = await this.quizQueue.add(
      "generate",
      {
        userId,
        dto,
        contentId: dto.contentId,
        files: fileData,
      },
      {
        removeOnComplete: { age: 60 }, // Keep for 1 minute
        removeOnFail: { age: 60 }, // Keep for 1 minute
        attempts: 2, // Retry 1 time
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );

    // Invalidate quiz cache after new quiz is generated
    const cacheKey = `quizzes:all:${userId}`;
    await this.cacheManager.del(cacheKey);

    this.logger.log(`Quiz generation job created with ID: ${job.id}`);
    return {
      jobId: job.id,
      status: "pending",
    };
  }

  async getJobStatus(jobId: string, userId: string) {
    this.logger.debug(`Checking job status for job ${jobId}, user ${userId}`);
    const job = await this.quizQueue.getJob(jobId);

    if (!job) {
      this.logger.warn(`Job ${jobId} not found`);
      throw new NotFoundException("Job not found");
    }

    // Security: check if job belongs to user
    if (job.data.userId !== userId) {
      this.logger.warn(
        `User ${userId} attempted to access job ${jobId} owned by ${job.data.userId}`
      );
      throw new NotFoundException("Job not found");
    }

    const state = await job.getState();
    const progress = job.progress;

    this.logger.debug(
      `Job ${jobId} status: ${state}, progress: ${JSON.stringify(progress)}`
    );

    return {
      jobId: job.id,
      status: state,
      progress,
      result: state === "completed" ? await job.returnvalue : null,
      error: state === "failed" ? job.failedReason : null,
    };
  }

  async getAllQuizzes(userId: string) {
    const cacheKey = `quizzes:all:${userId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for all quizzes, user ${userId}`);
      return cached;
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        topic: true,
        difficulty: true,
        createdAt: true,
        questions: true,
      },
    });

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, quizzes, 300000);

    return quizzes;
  }

  async getQuizById(id: string, userId: string) {
    // First, try to find quiz owned by the user
    let quiz = await this.prisma.quiz.findFirst({
      where: { id, userId },
    });

    // If not found, check if it's a challenge quiz that the user has access to
    if (!quiz) {
      // Find if this quiz is associated with any challenge (check both quizId and quizzes relationship)
      const challenge = await this.prisma.challenge.findFirst({
        where: {
          OR: [
            { quizId: id }, // Legacy single quiz
            { quizzes: { some: { quizId: id } } }, // New multi-quiz structure
          ],
          completions: {
            some: {
              userId: userId,
            },
          },
        },
      });

      // If user has joined a challenge with this quiz, allow access
      if (challenge) {
        quiz = await this.prisma.quiz.findUnique({
          where: { id },
        });
      }
    }

    if (!quiz) {
      throw new NotFoundException("Quiz not found");
    }

    // Remove sensitive information
    const sanitizedQuiz = {
      ...quiz,
      questions: (quiz.questions as any[]).map((q) => {
        const { correctAnswer, explanation, ...sanitizedQuestion } = q;
        return sanitizedQuestion;
      }),
    };

    return sanitizedQuiz;
  }

  async submitQuiz(userId: string, quizId: string, dto: SubmitQuizDto) {
    this.logger.log(`User ${userId} submitting quiz ${quizId}`);

    // First, try to find quiz owned by the user
    let quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, userId },
    });

    // If not found, check if it's a challenge quiz that the user has access to
    if (!quiz) {
      const challenge = await this.prisma.challenge.findFirst({
        where: {
          OR: [
            { quizId: quizId }, // Legacy single quiz
            { quizzes: { some: { quizId: quizId } } }, // New multi-quiz structure
          ],
          completions: {
            some: {
              userId: userId,
            },
          },
        },
      });

      // If user has joined a challenge with this quiz, allow submission
      if (challenge) {
        quiz = await this.prisma.quiz.findUnique({
          where: { id: quizId },
        });
      }
    }

    if (!quiz) {
      this.logger.warn(`Quiz ${quizId} not found for user ${userId}`);
      throw new NotFoundException("Quiz not found");
    }

    const questions = quiz.questions as any[];
    let correctCount = 0;

    const correctAnswers = questions.map((q, index) => {
      const isCorrect = this.checkAnswer(q, dto.answers[index]);
      if (isCorrect) correctCount++;
      return q.correctAnswer;
    });

    // Save attempt
    const attempt = await this.prisma.attempt.create({
      data: {
        userId,
        quizId,
        challengeId: dto.challengeId,
        type: dto.challengeId ? "challenge" : "quiz",
        score: correctCount,
        totalQuestions: questions.length,
        answers: dto.answers as any,
      },
    });

    // Invalidate quiz cache after submission
    await this.cacheManager.del(`quizzes:all:${userId}`);

    // If this is a challenge quiz, invalidate challenge cache immediately
    if (dto.challengeId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayKey = today.toISOString();
      await this.cacheManager.del(`challenges:daily:${userId}:${todayKey}`);
      await this.cacheManager.del(`challenges:all:${userId}`);
      this.logger.debug(
        `Invalidated challenge cache for user ${userId} after quiz submission`
      );
    }

    // Update streak with score data
    await this.streakService.updateStreak(
      userId,
      correctCount,
      questions.length
    );

    // Update challenge progress
    const isPerfect = correctCount === questions.length;
    this.challengeService
      .updateChallengeProgress(userId, "quiz", isPerfect)
      .catch((err) =>
        this.logger.error(
          `Failed to update challenge progress for user ${userId}:`,
          err
        )
      );

    // Generate and store recommendations based on the latest attempt.
    // Fire-and-forget so the API response isn't delayed.
    this.logger.debug(
      `Triggering recommendation generation for user ${userId}`
    );
    this.recommendationService
      .generateAndStoreRecommendations(userId)
      .catch((err) =>
        this.logger.error(
          `Failed to generate recommendations for user ${userId}:`,
          err
        )
      );

    // Update topic progress (Retention Tracking)
    const percentage = Math.round((correctCount / questions.length) * 100);
    this.studyService
      .updateProgress(userId, quiz.topic, percentage, quiz.contentId)
      .catch((err) =>
        this.logger.error(
          `Failed to update topic progress for user ${userId}:`,
          err
        )
      );

    this.logger.log(
      `Quiz ${quizId} submitted: ${correctCount}/${questions.length} correct`
    );
    return {
      attemptId: attempt.id,
      score: correctCount,
      totalQuestions: questions.length,
      percentage: Math.round((correctCount / questions.length) * 100),
      correctAnswers,
    };
  }

  /**
   * Check if an answer is correct based on question type
   */
  private checkAnswer(question: any, userAnswer: any): boolean {
    const correctAnswer = question.correctAnswer;
    const questionType = question.questionType || "single-select";

    switch (questionType) {
      case "true-false":
      case "single-select":
        return userAnswer === correctAnswer;

      case "multi-select": {
        if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer))
          return false;
        if (userAnswer.length !== correctAnswer.length) return false;
        const sortedUser = [...userAnswer].sort((a, b) => a - b);
        const sortedCorrect = [...correctAnswer].sort((a, b) => a - b);
        return sortedUser.every((val, idx) => val === sortedCorrect[idx]);
      }

      case "fill-blank":
        if (typeof userAnswer !== "string" || typeof correctAnswer !== "string")
          return false;
        return (
          userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim()
        );

      case "matching": {
        if (typeof userAnswer !== "object" || typeof correctAnswer !== "object")
          return false;
        const userKeys = Object.keys(userAnswer || {}).sort((a, b) =>
          a.localeCompare(b)
        );
        const correctKeys = Object.keys(correctAnswer || {}).sort((a, b) =>
          a.localeCompare(b)
        );
        if (userKeys.length !== correctKeys.length) return false;
        return userKeys.every((key) => userAnswer[key] === correctAnswer[key]);
      }

      default:
        return userAnswer === correctAnswer;
    }
  }

  async getAttempts(userId: string, quizId?: string) {
    const where: any = { userId, type: "quiz" };
    if (quizId) {
      where.quizId = quizId;
    }

    return this.prisma.attempt.findMany({
      where,
      orderBy: { completedAt: "desc" },
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

  async deleteQuiz(id: string, userId: string) {
    this.logger.log(`User ${userId} deleting quiz ${id}`);

    // Verify ownership
    const quiz = await this.prisma.quiz.findFirst({
      where: { id, userId },
    });

    if (!quiz) {
      this.logger.warn(`Quiz ${id} not found for user ${userId}`);
      throw new NotFoundException("Quiz not found");
    }

    // Delete associated attempts first
    await this.prisma.attempt.deleteMany({
      where: { quizId: id },
    });

    // Delete associated files from Cloudinary
    if (quiz.sourceFiles && quiz.sourceFiles.length > 0) {
      this.logger.debug(
        `Deleting ${quiz.sourceFiles.length} files from Cloudinary`
      );
      for (const fileUrl of quiz.sourceFiles) {
        if (fileUrl.includes("cloudinary")) {
          try {
            // Extract public_id from Cloudinary URL
            const urlParts = fileUrl.split("/");
            const filename = urlParts[urlParts.length - 1].split(".")[0];
            const folder = urlParts.slice(-3, -1).join("/");
            const publicId = `${folder}/${filename}`;
            await this.fileStorageService.deleteFile(publicId);
          } catch (error) {
            this.logger.warn(
              `Failed to delete file ${fileUrl}: ${error.message}`
            );
          }
        }
      }
    }

    // Dereference from content if applicable
    if (quiz.contentId) {
      try {
        await this.prisma.content.update({
          where: { id: quiz.contentId },
          data: { quizId: null },
        });
      } catch (error) {
        // Ignore if content not found or other error
        this.logger.warn(
          `Failed to dereference quiz ${id} from content ${quiz.contentId}: ${error.message}`
        );
      }
    }

    // Delete the quiz
    await this.prisma.quiz.delete({
      where: { id },
    });

    // Invalidate cache
    await this.cacheManager.del(`quizzes:all:${userId}`);

    this.logger.log(`Quiz ${id} deleted successfully`);
    return { success: true, message: "Quiz deleted successfully" };
  }
}
