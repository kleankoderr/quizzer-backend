import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { StreakService } from '../streak/streak.service';
import { ChallengeService } from '../challenge/challenge.service';
import { StudyService } from '../study/study.service';
import { GenerateQuizDto, SubmitQuizDto } from './dto/quiz.dto';
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from '../file-storage/interfaces/file-storage.interface';
import { QuizType } from '@prisma/client';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { processFileUploads } from '../common/helpers/file-upload.helpers';

const CACHE_TTL_MS = 300000; // 5 minutes
const DUPLICATE_SUBMISSION_WINDOW_MS = 10000; // 10 seconds

const PRISMA_TO_QUIZ_TYPE: Record<QuizType, string> = {
  [QuizType.STANDARD]: 'standard',
  [QuizType.TIMED_TEST]: 'timed',
  [QuizType.SCENARIO_BASED]: 'scenario',
  [QuizType.QUICK_CHECK]: 'standard',
  [QuizType.CONFIDENCE_BASED]: 'standard',
};

interface QuizSubmissionResult {
  attemptId: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  correctAnswers: any[];
  feedback: {
    message: string;
    percentile?: number;
  };
}

interface PostSubmissionContext {
  userId: string;
  quizId: string;
  challengeId?: string;
  correctCount: number;
  totalQuestions: number;
  topic: string;
  contentId: string | null;
  tags: string[] | null;
}

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    @InjectQueue('quiz-generation') private readonly quizQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly recommendationService: RecommendationService,
    private readonly streakService: StreakService,
    private readonly challengeService: ChallengeService,
    private readonly studyService: StudyService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('GOOGLE_FILE_STORAGE_SERVICE')
    private readonly googleFileStorageService: IFileStorageService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly cloudinaryFileStorageService: IFileStorageService,
    private readonly documentHashService: DocumentHashService
  ) {}

  // ==================== QUIZ GENERATION ====================

  async generateQuiz(
    userId: string,
    dto: GenerateQuizDto,
    files?: Express.Multer.File[]
  ) {
    this.logger.log(
      `User ${userId} requesting ${dto.numberOfQuestions} question(s), difficulty: ${dto.difficulty}`
    );

    const processedFiles = await this.processUploadedFiles(userId, files);

    try {
      const job = await this.quizQueue.add('generate', {
        userId,
        dto,
        contentId: dto.contentId,
        files: processedFiles.map((doc) => ({
          originalname: doc.originalName,
          cloudinaryUrl: doc.cloudinaryUrl,
          cloudinaryId: doc.cloudinaryId,
          googleFileUrl: doc.googleFileUrl,
          googleFileId: doc.googleFileId,
        })),
      });

      // Fire and forget cache invalidation
      this.invalidateUserCache(userId).catch((err) =>
        this.logger.warn(`Cache invalidation failed: ${err.message}`)
      );

      this.logger.log(`Quiz generation job created: ${job.id}`);
      return {
        jobId: job.id,
        status: 'pending',
      };
    } catch (error) {
      this.logger.error(
        `Failed to queue quiz job for user ${userId}:`,
        error.stack
      );
      throw new Error('Failed to start quiz generation. Please try again.');
    }
  }

  async getJobStatus(jobId: string, userId: string) {
    this.logger.debug(`Checking job ${jobId} for user ${userId}`);

    const job = await this.quizQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const [state, progress] = await Promise.all([
      job.getState(),
      Promise.resolve(job.progress),
    ]);

    this.logger.debug(`Job ${jobId}: ${state} (${JSON.stringify(progress)}%)`);

    return {
      jobId: job.id,
      status: state,
      progress,
      result: state === 'completed' ? await job.returnvalue : null,
      error: state === 'failed' ? job.failedReason : null,
    };
  }

  // ==================== QUIZ RETRIEVAL ====================

  async getAllQuizzes(userId: string) {
    const cacheKey = `quizzes:all:${userId}`;
    const cached = await this.getFromCache<any[]>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for user ${userId}`);
      return cached;
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        topic: true,
        difficulty: true,
        quizType: true,
        timeLimit: true,
        createdAt: true,
        questions: true,
      },
    });

    const transformedQuizzes = quizzes.map((quiz) => ({
      ...quiz,
      quizType: this.transformQuizType(quiz.quizType),
    }));

    await this.setCache(cacheKey, transformedQuizzes);
    this.logger.debug(
      `Cached ${transformedQuizzes.length} quizzes for user ${userId}`
    );

    return transformedQuizzes;
  }

  async getQuizById(id: string, userId: string) {
    // OPTIMIZATION: Check cache first
    const cacheKey = `quiz:${id}:${userId}`;
    const cached = await this.getFromCache<any>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for quiz ${id}`);
      return cached;
    }

    const quiz = await this.findAccessibleQuiz(id, userId);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const sanitized = this.sanitizeQuizForDisplay(quiz);

    // Cache for 5 minutes
    await this.setCache(cacheKey, sanitized);

    return sanitized;
  }

  // ==================== QUIZ SUBMISSION ====================
  // MAJOR OPTIMIZATION: Reduced from ~7 DB queries to 3-4 queries

  async submitQuiz(
    userId: string,
    quizId: string,
    dto: SubmitQuizDto
  ): Promise<QuizSubmissionResult> {
    this.logger.log(`User ${userId} submitting quiz ${quizId}`);

    // OPTIMIZATION 1: Check duplicate & fetch quiz in parallel
    const cutoff = new Date(Date.now() - DUPLICATE_SUBMISSION_WINDOW_MS);

    const [duplicateAttempt, quiz] = await Promise.all([
      this.prisma.attempt.findFirst({
        where: {
          userId,
          quizId,
          completedAt: { gte: cutoff },
        },
        select: {
          id: true,
          score: true,
          totalQuestions: true,
        },
      }),
      this.findAccessibleQuizOptimized(quizId, userId),
    ]);

    // Handle duplicate
    if (duplicateAttempt) {
      return this.handleDuplicateSubmissionOptimized(duplicateAttempt, quiz);
    }

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Grade quiz
    const questions = quiz.questions as any[];
    const { correctCount, correctAnswers } = this.gradeQuiz(
      questions,
      dto.answers
    );

    const percentage = Math.round((correctCount / questions.length) * 100);

    // OPTIMIZATION 2: Parallel execution of attempt save + feedback calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [attempt, feedbackData] = await Promise.all([
      // Save attempt
      this.prisma.attempt.create({
        data: {
          userId,
          quizId,
          challengeId: dto.challengeId,
          type: dto.challengeId ? 'challenge' : 'quiz',
          score: correctCount,
          totalQuestions: questions.length,
          answers: dto.answers as any,
        },
        select: { id: true },
      }),
      // Calculate feedback in parallel
      this.prisma.attempt
        .aggregate({
          where: {
            quizId,
            completedAt: { gte: today },
          },
          _count: {
            id: true,
          },
        })
        .then(async (countResult) => {
          const totalAttemptsToday = countResult._count.id;

          if (totalAttemptsToday > 0) {
            const betterThanCount = await this.prisma.attempt.count({
              where: {
                quizId,
                completedAt: { gte: today },
                score: { lt: correctCount },
              },
            });

            return { totalAttemptsToday, betterThanCount };
          }

          return { totalAttemptsToday: 0, betterThanCount: 0 };
        }),
    ]);

    // OPTIMIZATION 3: Fire all post-submission tasks asynchronously (non-blocking)
    // These don't affect the response, so run them in background
    this.handlePostSubmissionAsync({
      userId,
      quizId,
      challengeId: dto.challengeId,
      correctCount,
      totalQuestions: questions.length,
      topic: quiz.topic,
      contentId: quiz.contentId,
      tags: quiz.tags,
    });

    // Calculate feedback message
    const feedback = this.getFeedbackFromData(
      feedbackData.totalAttemptsToday,
      feedbackData.betterThanCount,
      percentage
    );

    this.logger.log(
      `Quiz ${quizId} submitted: ${correctCount}/${questions.length} correct`
    );

    return {
      attemptId: attempt.id,
      score: correctCount,
      totalQuestions: questions.length,
      percentage,
      correctAnswers,
      feedback,
    };
  }

  // ==================== ATTEMPT RETRIEVAL ====================

  async getAttemptById(attemptId: string, userId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            topic: true,
            difficulty: true,
            questions: true,
            quizType: true,
            timeLimit: true,
          },
        },
      },
    });

    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException('Attempt not found');
    }

    return attempt;
  }

  async getAttempts(userId: string, quizId?: string) {
    const where: any = { userId, type: 'quiz' };
    if (quizId) {
      where.quizId = quizId;
    }

    return this.prisma.attempt.findMany({
      where,
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

  // ==================== QUIZ DELETION ====================

  async deleteQuiz(id: string, userId: string) {
    this.logger.log(`Deleting quiz ${id} for user ${userId}`);

    const quiz = await this.prisma.quiz.findFirst({
      where: { id, userId },
      select: {
        id: true,
        sourceFiles: true,
        contentId: true,
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // OPTIMIZATION: Run deletions in parallel where safe
    await Promise.all([
      // Delete attempts
      this.prisma.attempt.deleteMany({
        where: { quizId: id },
      }),
      // Dereference from content (if exists)
      quiz.contentId
        ? this.prisma.content
            .update({
              where: { id: quiz.contentId },
              data: { quizId: null },
            })
            .catch((err) => {
              this.logger.warn(`Failed to dereference content: ${err.message}`);
            })
        : Promise.resolve(),
    ]);

    // Delete the quiz
    await this.prisma.quiz.delete({
      where: { id },
    });

    // Fire and forget file cleanup & cache invalidation
    this.cleanupQuizFilesAsync(quiz.sourceFiles);
    this.invalidateUserCache(userId).catch(() => {});

    this.logger.log(`Quiz ${id} deleted successfully`);
    return { success: true, message: 'Quiz deleted successfully' };
  }

  // ==================== OPTIMIZED HELPER METHODS ====================

  /**
   * OPTIMIZED: Fetch quiz with minimal fields and single query
   */
  private async findAccessibleQuizOptimized(quizId: string, userId: string) {
    // Try to fetch quiz directly with challenge access check in one query
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        OR: [
          { userId }, // User's own quiz
          {
            // Challenge quiz user has access to
            OR: [
              {
                challenges: {
                  some: {
                    completions: {
                      some: { userId },
                    },
                  },
                },
              },
              {
                challengeQuizzes: {
                  some: {
                    challenge: {
                      completions: {
                        some: { userId },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        questions: true,
        topic: true,
        contentId: true,
        tags: true,
        quizType: true,
      },
    });

    return quiz;
  }

  /**
   * OPTIMIZED: Handle duplicate with pre-fetched quiz data
   */
  private handleDuplicateSubmissionOptimized(
    attempt: any,
    quiz: any
  ): QuizSubmissionResult {
    this.logger.warn(`Duplicate submission detected for attempt ${attempt.id}`);

    const questions = (quiz?.questions as any[]) || [];
    const correctAnswers = questions.map((q) => q.correctAnswer);
    const percentage = Math.round(
      (attempt.score / attempt.totalQuestions) * 100
    );

    return {
      attemptId: attempt.id,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      percentage,
      correctAnswers,
      feedback: {
        message: 'Quiz already submitted.',
      },
    };
  }

  /**
   * OPTIMIZED: Get feedback from pre-calculated data
   */
  private getFeedbackFromData(
    totalAttemptsToday: number,
    betterThanCount: number,
    percentage: number
  ) {
    if (totalAttemptsToday > 1) {
      const percentile = Math.round(
        (betterThanCount / totalAttemptsToday) * 100
      );
      return {
        message: this.getPercentileFeedbackMessage(
          percentile,
          totalAttemptsToday
        ),
        percentile,
      };
    }

    return {
      message: this.getFirstAttemptFeedbackMessage(percentage),
    };
  }

  /**
   * OPTIMIZED: All post-submission tasks run async (non-blocking)
   */
  private handlePostSubmissionAsync(context: PostSubmissionContext): void {
    const {
      userId,
      challengeId,
      correctCount,
      totalQuestions,
      topic,
      contentId,
      tags,
    } = context;

    // All these run in background, don't block response
    Promise.all([
      // Invalidate caches
      this.invalidateUserCache(userId),
      challengeId ? this.invalidateChallengeCache(userId) : Promise.resolve(),

      // Update streak
      this.streakService
        .updateStreak(userId, correctCount, totalQuestions)
        .catch((err) =>
          this.logger.error(`Streak update failed: ${err.message}`)
        ),

      // Update challenge progress
      this.challengeService
        .updateChallengeProgress(
          userId,
          'quiz',
          correctCount === totalQuestions
        )
        .catch((err) =>
          this.logger.error(`Challenge update failed: ${err.message}`)
        ),

      // Generate recommendations
      this.recommendationService
        .generateAndStoreRecommendations(userId)
        .catch((err) =>
          this.logger.error(`Recommendations failed: ${err.message}`)
        ),

      // Update topic progress
      this.studyService
        .updateProgress(
          userId,
          topic,
          Math.round((correctCount / totalQuestions) * 100),
          contentId
        )
        .catch((err) =>
          this.logger.error(`Topic progress update failed: ${err.message}`)
        ),

      // Handle onboarding
      tags?.includes('Onboarding')
        ? this.prisma.user
            .update({
              where: { id: userId },
              data: { onboardingAssessmentCompleted: true },
            })
            .catch((err) =>
              this.logger.error(`Onboarding update failed: ${err.message}`)
            )
        : Promise.resolve(),
    ]).catch((err) => {
      this.logger.error(`Post-submission tasks failed: ${err.message}`);
    });
  }

  /**
   * OPTIMIZED: Cleanup files asynchronously
   */
  private cleanupQuizFilesAsync(sourceFiles: string[] | null): void {
    if (!sourceFiles || sourceFiles.length === 0) {
      return;
    }

    Promise.all([
      this.deleteQuizFiles(sourceFiles),
      this.deleteDocumentHashes(sourceFiles),
    ]).catch((err) => {
      this.logger.warn(`File cleanup failed: ${err.message}`);
    });
  }

  // ==================== EXISTING HELPER METHODS ====================

  private async processUploadedFiles(
    userId: string,
    files?: Express.Multer.File[]
  ) {
    if (!files || files.length === 0) {
      return [];
    }

    try {
      const processedDocs = await processFileUploads(
        files,
        this.documentHashService,
        this.cloudinaryFileStorageService,
        this.googleFileStorageService
      );

      const duplicateCount = processedDocs.filter((d) => d.isDuplicate).length;
      if (duplicateCount > 0) {
        this.logger.log(
          `Skipped ${duplicateCount} duplicate file(s) for user ${userId}`
        );
      }

      return processedDocs;
    } catch (error) {
      this.logger.error(
        `File processing failed for user ${userId}:`,
        error.stack
      );
      throw new Error(`Failed to upload files: ${error.message}`);
    }
  }

  private transformQuizType(quizType: QuizType): string {
    return PRISMA_TO_QUIZ_TYPE[quizType] || 'standard';
  }

  private async findAccessibleQuiz(quizId: string, userId: string) {
    let quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, userId },
    });

    if (!quiz) {
      const challenge = await this.prisma.challenge.findFirst({
        where: {
          OR: [{ quizId: quizId }, { quizzes: { some: { quizId: quizId } } }],
          completions: {
            some: { userId },
          },
        },
      });

      if (challenge) {
        quiz = await this.prisma.quiz.findUnique({
          where: { id: quizId },
        });
      }
    }

    return quiz;
  }

  private sanitizeQuizForDisplay(quiz: any) {
    return {
      ...quiz,
      quizType: this.transformQuizType(quiz.quizType),
      questions: (quiz.questions as any[]).map((q) => {
        const { _correctAnswer, _explanation, ...sanitizedQuestion } = q;
        return sanitizedQuestion;
      }),
    };
  }

  private gradeQuiz(questions: any[], answers: any[]) {
    let correctCount = 0;
    const correctAnswers = questions.map((q, index) => {
      const isCorrect = this.checkAnswer(q, answers[index]);
      if (isCorrect) correctCount++;
      return q.correctAnswer;
    });

    return { correctCount, correctAnswers };
  }

  private checkAnswer(question: any, userAnswer: any): boolean {
    const correctAnswer = question.correctAnswer;
    const questionType = question.questionType || 'single-select';

    switch (questionType) {
      case 'true-false':
      case 'single-select':
        return userAnswer === correctAnswer;

      case 'multi-select':
        return this.checkMultiSelectAnswer(userAnswer, correctAnswer);

      case 'fill-blank':
        return this.checkFillBlankAnswer(userAnswer, correctAnswer);

      case 'matching':
        return this.checkMatchingAnswer(userAnswer, correctAnswer);

      default:
        return userAnswer === correctAnswer;
    }
  }

  private checkMultiSelectAnswer(userAnswer: any, correctAnswer: any): boolean {
    if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) {
      return false;
    }
    if (userAnswer.length !== correctAnswer.length) {
      return false;
    }

    const sortedUser = [...userAnswer].sort((a, b) => a - b);
    const sortedCorrect = [...correctAnswer].sort((a, b) => a - b);

    return sortedUser.every((val, idx) => val === sortedCorrect[idx]);
  }

  private checkFillBlankAnswer(userAnswer: any, correctAnswer: any): boolean {
    if (typeof userAnswer !== 'string' || typeof correctAnswer !== 'string') {
      return false;
    }

    const userNormalized = userAnswer.toLowerCase().trim();
    const correctNormalized = correctAnswer.toLowerCase().trim();

    if (userNormalized === correctNormalized) {
      return true;
    }

    if (
      correctNormalized.includes(userNormalized) &&
      userNormalized.length >= correctNormalized.length * 0.6
    ) {
      return true;
    }

    const correctWords = correctNormalized.split(/\s+/);
    const userWords = userNormalized.split(/\s+/);

    if (correctWords.length > 1 && userWords.length > 0) {
      const matchedWords = userWords.filter((word) =>
        correctWords.some(
          (cWord) => cWord.includes(word) || word.includes(cWord)
        )
      );
      if (matchedWords.length >= Math.ceil(correctWords.length * 0.7)) {
        return true;
      }
    }

    return false;
  }

  private checkMatchingAnswer(userAnswer: any, correctAnswer: any): boolean {
    if (typeof userAnswer !== 'object' || typeof correctAnswer !== 'object') {
      return false;
    }

    const userKeys = Object.keys(userAnswer || {}).sort((a, b) =>
      a.localeCompare(b)
    );
    const correctKeys = Object.keys(correctAnswer || {}).sort((a, b) =>
      a.localeCompare(b)
    );

    if (userKeys.length !== correctKeys.length) {
      return false;
    }

    return userKeys.every((key) => userAnswer[key] === correctAnswer[key]);
  }

  private getPercentileFeedbackMessage(
    percentile: number,
    totalAttempts: number
  ): string {
    if (percentile >= 90) {
      return `Outstanding! Top **${100 - percentile}%** today. Keep leading!`;
    } else if (percentile >= 70) {
      return `Great job! Better than **${percentile}%** of students today.`;
    } else if (percentile >= 50) {
      return `Good effort! You're above average today.`;
    } else {
      return `Done! You joined **${totalAttempts}** others today. Review to improve!`;
    }
  }

  private getFirstAttemptFeedbackMessage(percentage: number): string {
    if (percentage >= 90) {
      return 'Excellent! You set the bar high today!';
    } else if (percentage >= 70) {
      return "Great start! You're on the right track.";
    } else {
      return 'Good practice! Review to master this topic.';
    }
  }

  private async deleteQuizFiles(sourceFiles: string[] | null): Promise<void> {
    if (!sourceFiles || sourceFiles.length === 0) {
      return;
    }

    this.logger.debug(`Deleting ${sourceFiles.length} file(s) from storage`);

    for (const fileUrl of sourceFiles) {
      try {
        const fileId = this.extractGoogleFileId(fileUrl);
        await this.googleFileStorageService.deleteFile(fileId);
      } catch (error) {
        this.logger.warn(`Failed to delete file ${fileUrl}:`, error.message);
      }
    }
  }

  private extractGoogleFileId(fileUrl: string): string {
    if (fileUrl.includes('files/')) {
      const parts = fileUrl.split('files/')[1].split('?');
      return parts[0];
    }
    return fileUrl;
  }

  private async deleteDocumentHashes(
    sourceFiles: string[] | null
  ): Promise<void> {
    if (!sourceFiles || sourceFiles.length === 0) {
      return;
    }

    this.logger.debug(
      `Deleting document hashes for ${sourceFiles.length} file(s)`
    );

    for (const fileUrl of sourceFiles) {
      try {
        await this.documentHashService.deleteDocumentByGoogleFileUrl(fileUrl);
      } catch (error) {
        this.logger.warn(
          `Failed to delete document hash for ${fileUrl}:`,
          error.message
        );
      }
    }
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    const cacheKey = `quizzes:all:${userId}`;
    await this.cacheManager.del(cacheKey);
  }

  private async invalidateChallengeCache(userId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString();

    await Promise.all([
      this.cacheManager.del(`challenges:daily:${userId}:${todayKey}`),
      this.cacheManager.del(`challenges:all:${userId}`),
    ]);

    this.logger.debug(`Invalidated challenge cache for user ${userId}`);
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      return (await this.cacheManager.get(key)) as T | null;
    } catch (error) {
      this.logger.warn(`Cache retrieval failed for ${key}:`, error.message);
      return null;
    }
  }

  private async setCache(key: string, value: any): Promise<void> {
    try {
      await this.cacheManager.set(key, value, CACHE_TTL_MS);
    } catch (error) {
      this.logger.warn(`Cache storage failed for ${key}:`, error.message);
    }
  }
}
