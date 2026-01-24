import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/services/cache.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { QuizType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { LangChainService } from '../langchain/langchain.service';
import { QuizGenerationSchema } from '../langchain/schemas/quiz.schema';
import { LangChainPrompts } from '../langchain/prompts';
import { QuizUtils } from '../quiz/quiz.utils';

/**
 * Transform Prisma QuizType enum to frontend-compatible format
 */
function transformQuizType(quizType: QuizType): string {
  const typeMap: Record<QuizType, string> = {
    [QuizType.STANDARD]: 'standard',
    [QuizType.TIMED_TEST]: 'timed',
    [QuizType.SCENARIO_BASED]: 'scenario',
    [QuizType.QUICK_CHECK]: 'standard',
    [QuizType.CONFIDENCE_BASED]: 'standard',
  };
  return typeMap[quizType] || 'standard';
}

// Constants
const CACHE_TTL = {
  ALL_CHALLENGES: 120000, // 2 minutes
  DAILY_CHALLENGES: null, // Calculated dynamically until midnight
} as const;

const CHALLENGE_DURATION = {
  WEEKLY: 7,
  HOT: 4, // hours
} as const;

const DIFFICULTY_THRESHOLDS = {
  HIGH_PERFORMANCE: 75,
  LOW_PERFORMANCE: 50,
} as const;

// Types
export interface QuizAttempt {
  quizId: string;
  score: number;
  totalQuestions: number;
  attemptId: string;
  completedAt: string;
}

export interface ChallengeData {
  title: string;
  description: string;
  type: string;
  target: number;
  reward: number;
  startDate: Date;
  endDate: Date;
  quizId?: string;
  format: string;
}

export interface PerformanceByDifficulty {
  easy: number[];
  medium: number[];
  hard: number[];
}

@Injectable()
export class ChallengeService {
  private readonly logger = new Logger(ChallengeService.name);
  private readonly systemUserEmail =
    this.configService.get<string>('ADMIN_EMAIL');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly langchainService: LangChainService,
    private readonly leaderboardService: LeaderboardService,
    private readonly configService: ConfigService
  ) {}

  async getAllChallenges(userId: string) {
    const cacheKey = this.getCacheKey('all', userId);
    const cached = await this.cacheService.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for all challenges, user ${userId}`);
      return cached;
    }

    const challenges = await this.prisma.challenge.findMany({
      where: {
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      include: {
        _count: { select: { completions: true } },
        completions: {
          where: { userId },
          take: 1,
        },
        quizzes: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter out challenges without quizzes
    const validChallenges = challenges.filter(
      (challenge) =>
        challenge.quizId || (challenge.quizzes && challenge.quizzes.length > 0)
    );

    const challengesWithProgress = validChallenges.map((challenge) => {
      const completion = challenge.completions[0];
      return {
        ...challenge,
        progress: completion?.progress || 0,
        completed: completion?.completed || false,
        joined: !!completion,
        participantCount: challenge._count.completions,
        // Remove completion array from response to keep it clean
        completions: undefined,
        _count: undefined,
      };
    });

    await this.cacheService.set(
      cacheKey,
      challengesWithProgress,
      CACHE_TTL.ALL_CHALLENGES
    );

    return challengesWithProgress;
  }

  async getDailyChallenges(userId: string) {
    this.logger.debug(`Fetching daily challenges for user ${userId}`);

    const { today, tomorrow } = this.getTodayDateRange();
    const cacheKey = this.getCacheKey('daily', userId, today);
    const cached = await this.cacheService.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for daily challenges, user ${userId}`);
      return cached;
    }

    const challenges = await this.fetchDailyChallenges(today, tomorrow, userId);

    if (challenges.length === 0) {
      this.logger.warn(
        'No daily challenges found. Triggering fallback generation.'
      );
    }

    const result = challenges.map((challenge) => {
      const completion = challenge.completions[0];
      return {
        ...challenge,
        userProgress: completion?.progress || 0,
        completed: completion?.completed || false,
        participantCount: challenge._count.completions,
        joined: !!completion,
        completions: undefined,
        _count: undefined,
      };
    });

    const ttl = tomorrow.getTime() - Date.now();
    await this.cacheService.set(cacheKey, result, ttl);

    return result;
  }

  // Helper method to fetch daily challenges with efficient partial selection
  private async fetchDailyChallenges(start: Date, end: Date, userId: string) {
    return this.prisma.challenge.findMany({
      where: {
        type: 'daily',
        startDate: { gte: start },
        endDate: { lt: end },
      },
      include: {
        _count: { select: { completions: true } },
        completions: {
          where: { userId },
          take: 1,
        },
        quizzes: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getChallengeById(challengeId: string, userId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        quizzes: {
          include: {
            quiz: {
              select: {
                id: true,
                title: true,
                topic: true,
                difficulty: true,
                quizType: true,
                timeLimit: true,
                questions: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        quiz: {
          select: {
            id: true,
            title: true,
            topic: true,
            difficulty: true,
            quizType: true,
            timeLimit: true,
            questions: true,
          },
        },
        completions: { where: { userId } },
        _count: { select: { completions: true } },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    const completion = challenge?.completions?.[0];
    // Transform quiz types for frontend compatibility
    const transformedChallenge = {
      ...challenge,
      quiz: challenge.quiz
        ? {
            ...challenge.quiz,
            quizType: transformQuizType(challenge.quiz.quizType),
          }
        : challenge.quiz,
      quizzes: challenge.quizzes?.map((cq) => ({
        ...cq,
        quiz: {
          ...cq.quiz,
          quizType: transformQuizType(cq.quiz.quizType),
        },
      })),
      progress: completion?.progress || 0,
      completed: completion?.completed || false,
      currentQuizIndex: completion?.currentQuizIndex || 0,
      quizAttempts: completion?.quizAttempts || [],
      finalScore: completion?.finalScore,
      percentile: completion?.percentile,
      participantCount: challenge._count.completions,
      joined: !!completion,
    };

    return transformedChallenge;
  }

  async getChallengesByType(userId: string, type: string) {
    const challenges = await this.prisma.challenge.findMany({
      where: {
        type,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      include: {
        completions: { where: { userId } },
        _count: { select: { completions: true } },
        quizzes: true, // Include quizzes to check if challenge has any
      },
    });

    // Filter out challenges without quizzes
    const validChallenges = challenges.filter(
      (challenge) =>
        challenge.quizId || (challenge.quizzes && challenge.quizzes.length > 0)
    );

    return validChallenges.map((challenge) => ({
      ...challenge,
      progress: challenge.completions[0]?.progress || 0,
      completed: challenge.completions[0]?.completed || false,
      joined: !!challenge.completions[0],
      participantCount: challenge._count.completions,
    }));
  }

  async getHotChallenges(userId: string) {
    return this.getChallengesByType(userId, 'hot');
  }

  async getWeeklyChallenges(userId: string) {
    return this.getChallengesByType(userId, 'weekly');
  }

  async getMonthlyChallenges(userId: string) {
    return this.getChallengesByType(userId, 'monthly');
  }

  async getChallengeProgress(challengeId: string, userId: string) {
    const cacheKey = this.getCacheKey(
      'progress',
      userId,
      undefined,
      challengeId
    );
    const cached = await this.cacheService.get(cacheKey);

    if (cached) {
      this.logger.debug(
        `Cache hit for challenge progress ${challengeId}, user ${userId}`
      );
      return cached;
    }

    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        quizzes: { orderBy: { order: 'asc' } },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    const completion = await this.prisma.challengeCompletion.findUnique({
      where: {
        challengeId_userId: { challengeId, userId },
      },
    });

    const totalQuizzes = challenge.quizzes.length || (challenge.quizId ? 1 : 0);

    if (!completion) {
      return {
        currentQuizIndex: 0,
        totalQuizzes,
        completedQuizzes: 0,
        quizAttempts: [],
        finalScore: null,
        percentile: null,
        completed: false,
      };
    }

    const result = {
      currentQuizIndex: completion.currentQuizIndex,
      totalQuizzes,
      completedQuizzes: completion.currentQuizIndex,
      quizAttempts: (completion.quizAttempts as unknown as QuizAttempt[]) || [],
      finalScore: completion.finalScore,
      percentile: completion.percentile,
      completed: completion.completed,
    };

    await this.cacheService.set(cacheKey, result, 300000);
    return result;
  }

  async getChallengeLeaderboard(challengeId: string, userId: string) {
    const completions = await this.prisma.challengeCompletion.findMany({
      where: {
        challengeId,
        completed: true,
        finalScore: { not: null },
      },
      include: {
        challenge: {
          select: { id: true, title: true },
        },
      },
      orderBy: [{ finalScore: 'desc' }, { completedAt: 'asc' }],
      take: 50,
    });

    const entries = await Promise.all(
      completions.map(async (completion, index) => {
        const user = await this.prisma.user.findUnique({
          where: { id: completion.userId },
          select: { id: true, name: true, avatar: true, schoolName: true },
        });

        return {
          userId: completion.userId,
          userName: user?.name || 'Unknown',
          avatar: user?.avatar,
          schoolName: user?.schoolName,
          score: completion.finalScore,
          rank: index + 1,
          completedAt: completion.completedAt?.toISOString(),
        };
      })
    );

    let currentUserEntry = entries.find((e) => e.userId === userId);

    if (!currentUserEntry) {
      const userCompletion = await this.prisma.challengeCompletion.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
      });

      if (userCompletion) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, avatar: true, schoolName: true },
        });

        let rank = null;
        if (userCompletion.completed && userCompletion.finalScore !== null) {
          const betterScores = await this.prisma.challengeCompletion.count({
            where: {
              challengeId,
              finalScore: { gt: userCompletion.finalScore },
              completed: true,
            },
          });
          rank = betterScores + 1;
        }

        currentUserEntry = {
          userId,
          userName: user?.name || 'Unknown',
          avatar: user?.avatar,
          schoolName: user?.schoolName,
          score: userCompletion.finalScore || 0,
          rank,
          completedAt: userCompletion.completedAt?.toISOString(),
        } as any;
      }
    }

    return {
      entries: entries.slice(0, 11),
      currentUser: currentUserEntry || null,
    };
  }

  async generateDailyChallenges(startDate?: Date, endDate?: Date) {
    const { start, end } = this.getDateRange(startDate, endDate);

    this.logger.log(`Generating daily challenges for ${start.toISOString()}`);

    const existingTitles = await this.getExistingChallengeTitles(
      'daily',
      start,
      end
    );

    if (existingTitles.size > 0) {
      this.logger.log(
        `Found ${existingTitles.size} existing daily challenges for ${start.toISOString()}`
      );
    }

    const systemUser = await this.getSystemUser();
    const { validQuizzes, optimalDifficulty } =
      await this.analyzeUserActivity(start);

    const challengesToCreate = await this.buildDailyChallenges(
      validQuizzes,
      optimalDifficulty,
      start,
      end,
      systemUser.id,
      existingTitles
    );

    if (challengesToCreate.length > 0) {
      await this.saveChallenges(challengesToCreate);
      this.logger.log(
        `Successfully created ${challengesToCreate.length} daily challenges`
      );
    } else {
      this.logger.warn('No challenges were created');
    }
  }

  async generateWeeklyChallenges() {
    const { start, end } = this.getWeeklyDateRange();

    this.logger.log(`Generating weekly challenges for ${start.toISOString()}`);

    const existingChallenges = await this.findExistingChallenges(
      'weekly',
      start,
      end
    );

    if (existingChallenges.length > 0) {
      this.logger.log(
        `Weekly challenges already exist for ${start.toISOString()}. Skipping creation.`
      );
      return;
    }

    const challengesToCreate: ChallengeData[] = [
      {
        title: 'Weekly Warrior',
        description: 'Complete 10 quizzes this week.',
        type: 'weekly',
        target: 10,
        reward: 500,
        startDate: start,
        endDate: end,
        format: 'STANDARD',
      },
      {
        title: 'Consistency is Key',
        description: 'Maintain a 3-day streak this week.',
        type: 'weekly',
        target: 3,
        reward: 300,
        startDate: start,
        endDate: end,
        format: 'STANDARD',
      },
    ];

    await this.saveChallenges(challengesToCreate);
  }

  async generateMonthlyChallenges() {
    const { start, end } = this.getMonthlyDateRange();

    this.logger.log(`Generating monthly challenges for ${start.toISOString()}`);

    const existingChallenges = await this.findExistingChallenges(
      'monthly',
      start,
      end
    );

    if (existingChallenges.length > 0) {
      this.logger.log(
        `Monthly challenges already exist for ${start.toISOString()}. Skipping creation.`
      );
      return;
    }

    const challengesToCreate: ChallengeData[] = [
      {
        title: 'Monthly Master',
        description: 'Earn 2000 XP this month.',
        type: 'monthly',
        target: 2000,
        reward: 2000,
        startDate: start,
        endDate: end,
        format: 'TIMED',
      },
      {
        title: 'Quiz Marathon',
        description: 'Complete 50 quizzes this month.',
        type: 'monthly',
        target: 50,
        reward: 1500,
        startDate: start,
        endDate: end,
        format: 'TIMED',
      },
    ];

    await this.saveChallenges(challengesToCreate);
  }

  async generateHotChallenges() {
    const start = new Date();
    const end = new Date(start);
    end.setHours(end.getHours() + CHALLENGE_DURATION.HOT);

    this.logger.log(`Generating hot challenges for ${start.toISOString()}`);

    const existingChallenges = await this.prisma.challenge.findMany({
      where: {
        type: 'hot',
        endDate: { gte: new Date() },
      },
    });

    if (existingChallenges.length > 0) {
      this.logger.log(
        'Hot challenges already exist and are still active. Skipping creation.'
      );
      return;
    }

    const challengesToCreate: ChallengeData[] = [
      {
        title: 'Flash Challenge: Quick Fire',
        description: 'Complete 3 quizzes in the next 4 hours!',
        type: 'hot',
        target: 3,
        reward: 300,
        startDate: start,
        endDate: end,
        format: 'SPEED',
      },
    ];

    await this.saveChallenges(challengesToCreate);
  }

  async startChallenge(challengeId: string, userId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        quizzes: { orderBy: { order: 'asc' } },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    if (new Date() > challenge.endDate) {
      throw new BadRequestException('Challenge has expired');
    }

    if (new Date() < challenge.startDate) {
      throw new BadRequestException('Challenge has not started yet');
    }

    let completion = await this.prisma.challengeCompletion.findUnique({
      where: {
        challengeId_userId: { challengeId, userId },
      },
    });

    if (!completion) {
      completion = await this.prisma.challengeCompletion.create({
        data: {
          challengeId,
          userId,
          progress: 0,
          completed: false,
          currentQuizIndex: 0,
          quizAttempts: [],
        },
      });
    }

    return {
      challengeId,
      currentQuizIndex: completion.currentQuizIndex,
      totalQuizzes: challenge.quizzes.length || (challenge.quizId ? 1 : 0),
      quizAttempts: (completion.quizAttempts as unknown as QuizAttempt[]) || [],
    };
  }

  async joinChallenge(challengeId: string, userId: string) {
    this.logger.debug(`User ${userId} joining challenge ${challengeId}`);

    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        _count: { select: { completions: true } },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    if (new Date() > challenge.endDate) {
      throw new BadRequestException('Challenge has expired');
    }

    if (new Date() < challenge.startDate) {
      throw new BadRequestException('Challenge has not started yet');
    }

    const existingCompletion = await this.prisma.challengeCompletion.findUnique(
      {
        where: {
          challengeId_userId: { challengeId, userId },
        },
      }
    );

    if (existingCompletion) {
      return {
        ...challenge,
        progress: existingCompletion.progress,
        completed: existingCompletion.completed,
        joined: true,
      };
    }

    await this.prisma.challengeCompletion.create({
      data: {
        challengeId,
        userId,
        progress: 0,
        completed: false,
      },
    });

    this.logger.log(
      `User ${userId} successfully joined challenge ${challengeId}`
    );

    await this.invalidateUserCache(userId);

    return {
      ...challenge,
      progress: 0,
      completed: false,
      joined: true,
      participantCount: (challenge._count?.completions || 0) + 1,
    };
  }

  async leaveChallenge(challengeId: string, userId: string) {
    this.logger.debug(`User ${userId} leaving challenge ${challengeId}`);

    const completion = await this.prisma.challengeCompletion.findUnique({
      where: {
        challengeId_userId: { challengeId, userId },
      },
    });

    if (!completion) {
      throw new NotFoundException('You have not joined this challenge');
    }

    if (completion.progress > 0 || completion.completed) {
      throw new BadRequestException(
        'Cannot leave a challenge you have already started or completed'
      );
    }

    await this.prisma.challengeCompletion.delete({
      where: { id: completion.id },
    });

    this.logger.log(
      `User ${userId} successfully left challenge ${challengeId}`
    );

    await this.invalidateUserCache(userId);

    return { success: true };
  }

  async completeChallenge(challengeId: string, userId: string) {
    const completion = await this.prisma.challengeCompletion.findUnique({
      where: {
        challengeId_userId: { challengeId, userId },
      },
      include: { challenge: true },
    });

    if (!completion) {
      throw new NotFoundException('Challenge not found or not joined');
    }

    if (completion.completed) {
      throw new BadRequestException('Challenge already completed');
    }

    if (completion.progress < completion.challenge.target) {
      throw new BadRequestException('Challenge requirements not met');
    }

    return this.prisma.challengeCompletion.update({
      where: {
        challengeId_userId: { challengeId, userId },
      },
      data: {
        completed: true,
        completedAt: new Date(),
      },
    });
  }

  async completeQuizInChallenge(
    challengeId: string,
    quizId: string,
    userId: string,
    attemptData: { score: number; totalQuestions: number; attemptId: string }
  ) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        quizzes: { orderBy: { order: 'asc' } },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    const completion = await this.prisma.challengeCompletion.findUnique({
      where: {
        challengeId_userId: { challengeId, userId },
      },
    });

    if (!completion) {
      throw new NotFoundException('Challenge not started');
    }

    const quizAttempts =
      (completion.quizAttempts as unknown as QuizAttempt[]) || [];
    quizAttempts.push({
      quizId,
      score: attemptData.score,
      totalQuestions: attemptData.totalQuestions,
      attemptId: attemptData.attemptId,
      completedAt: new Date().toISOString(),
    });

    const totalQuizzes = challenge.quizzes.length || (challenge.quizId ? 1 : 0);
    const nextQuizIndex = completion.currentQuizIndex + 1;
    const isCompleted = nextQuizIndex >= totalQuizzes;

    let finalScore = null;
    let percentile = null;

    if (isCompleted) {
      finalScore = this.calculateFinalScore(quizAttempts);
      percentile = await this.calculatePercentile(challengeId, finalScore);
      const xpAmount =
        finalScore >= 75
          ? challenge.reward
          : Math.floor(challenge.reward * (finalScore / 100));
      await this.awardChallengeXP(userId, xpAmount);
    }

    await this.prisma.challengeCompletion.update({
      where: { id: completion.id },
      data: {
        currentQuizIndex: nextQuizIndex,
        quizAttempts: quizAttempts as any,
        progress: nextQuizIndex,
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
        finalScore,
        percentile,
      },
    });

    await this.invalidateUserCache(userId);
    await this.cacheService.invalidate(
      this.getCacheKey('progress', userId, undefined, challengeId)
    );

    return {
      currentQuizIndex: nextQuizIndex,
      totalQuizzes,
      completed: isCompleted,
      quizAttempts,
      finalScore,
      percentile,
    };
  }

  async updateChallengeProgress(
    userId: string,
    type: 'quiz' | 'flashcard',
    isPerfect = false
  ) {
    this.logger.debug(
      `Updating challenge progress for user ${userId}, type: ${type}`
    );

    const { today, tomorrow } = this.getTodayDateRange();

    const challenges = await this.prisma.challenge.findMany({
      where: {
        type: 'daily',
        startDate: { gte: today, lt: tomorrow },
      },
      include: {
        completions: { where: { userId } },
      },
    });

    const updates = [];

    for (const challenge of challenges) {
      const completion = challenge.completions[0];
      if (!completion || completion.completed) continue;

      const progressUpdate = this.calculateProgressUpdate(
        challenge,
        completion,
        type,
        isPerfect
      );

      if (progressUpdate.shouldUpdate) {
        const isCompleted = progressUpdate.newProgress >= challenge.target;

        updates.push(
          this.prisma.challengeCompletion.update({
            where: { id: completion.id },
            data: {
              progress: Math.min(progressUpdate.newProgress, challenge.target),
              completed: isCompleted,
              completedAt: isCompleted ? new Date() : null,
            },
          })
        );

        if (isCompleted) {
          await this.awardChallengeXP(userId, challenge.reward);
          this.logger.log(
            `User ${userId} completed challenge: ${challenge.title}, reward: ${challenge.reward} XP`
          );
        }

        await this.cacheService.invalidate(
          this.getCacheKey('progress', userId, undefined, challenge.id)
        );
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      await this.invalidateUserCache(userId);
    }
  }

  // ==================== Private Helper Methods ====================

  private getCacheKey(
    type: 'all' | 'daily' | 'progress',
    userId: string,
    date?: Date,
    challengeId?: string
  ): string {
    if (type === 'all') {
      return `challenges:all:${userId}`;
    }
    if (type === 'progress') {
      return `challenges:progress:${userId}:${challengeId}`;
    }
    return `challenges:daily:${userId}:${date?.toISOString()}`;
  }

  private getTodayDateRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { today, tomorrow };
  }

  private getDateRange(startDate?: Date, endDate?: Date) {
    const start = startDate || new Date();
    start.setHours(0, 0, 0, 0);
    const end = endDate || new Date(start);
    if (!endDate) end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private getWeeklyDateRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + CHALLENGE_DURATION.WEEKLY);
    return { start, end };
  }

  private getMonthlyDateRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  private async getExistingChallengeTitles(
    type: string,
    start: Date,
    end: Date
  ): Promise<Set<string>> {
    const existingChallenges = await this.findExistingChallenges(
      type,
      start,
      end
    );
    return new Set(existingChallenges.map((c) => c.title.toLowerCase()));
  }

  private async findExistingChallenges(type: string, start: Date, end: Date) {
    return this.prisma.challenge.findMany({
      where: {
        type,
        startDate: { gte: start, lt: end },
      },
      select: { title: true },
    });
  }

  private async getSystemUser() {
    this.logger.debug('Fetching system user...');
    const systemUser = await this.prisma.user.findUnique({
      where: { email: this.systemUserEmail },
    });
    return systemUser;
  }

  private async analyzeUserActivity(start: Date) {
    const lastWeek = new Date(start);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const validQuizzes = await this.getPopularQuizzes(lastWeek);
    const performanceByDifficulty =
      await this.analyzePerformanceByDifficulty(lastWeek);
    const optimalDifficulty = this.determineOptimalDifficulty(
      performanceByDifficulty
    );

    this.logger.log(
      `Found ${validQuizzes.length} valid quizzes from popular topics: ${validQuizzes.map((q) => q.topic).join(', ')}`
    );

    return { validQuizzes, optimalDifficulty };
  }

  private async getPopularQuizzes(lastWeek: Date) {
    const popularQuizzes = await this.prisma.attempt.groupBy({
      by: ['quizId'],
      where: {
        createdAt: { gte: lastWeek },
        quizId: { not: null },
      },
      _count: { quizId: true },
      orderBy: {
        _count: { quizId: 'desc' },
      },
      take: 20,
    });

    const quizDetails = await Promise.all(
      popularQuizzes.map(async (pq) => {
        if (!pq.quizId) return null;
        const quiz = await this.prisma.quiz.findUnique({
          where: { id: pq.quizId },
          select: {
            id: true,
            topic: true,
            difficulty: true,
            title: true,
          },
        });
        return quiz ? { ...quiz, attemptCount: pq._count.quizId } : null;
      })
    );

    const validDetails = quizDetails.filter((q) => q !== null);

    // Shuffle the array to reduce bias towards the absolute most popular quizzes
    // This ensures variety in daily challenges while still keeping them relevant
    for (let i = validDetails.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validDetails[i], validDetails[j]] = [validDetails[j], validDetails[i]];
    }

    return validDetails;
  }

  private async analyzePerformanceByDifficulty(
    lastWeek: Date
  ): Promise<PerformanceByDifficulty> {
    const recentAttempts = await this.prisma.attempt.findMany({
      where: {
        createdAt: { gte: lastWeek },
        quizId: { not: null },
        score: { not: null },
        totalQuestions: { not: null },
      },
      select: {
        score: true,
        totalQuestions: true,
        quiz: { select: { difficulty: true } },
      },
      take: 100,
    });

    const performanceByDifficulty: PerformanceByDifficulty = {
      easy: [],
      medium: [],
      hard: [],
    };

    for (const attempt of recentAttempts) {
      if (attempt.quiz && attempt.score && attempt.totalQuestions) {
        const percentage = (attempt.score / attempt.totalQuestions) * 100;
        const difficulty = attempt.quiz.difficulty as
          | 'easy'
          | 'medium'
          | 'hard';
        if (performanceByDifficulty[difficulty]) {
          performanceByDifficulty[difficulty].push(percentage);
        }
      }
    }

    return performanceByDifficulty;
  }

  private determineOptimalDifficulty(
    performanceByDifficulty: PerformanceByDifficulty
  ): 'easy' | 'medium' | 'hard' {
    const avgPerformance = {
      easy: this.calculateAverage(performanceByDifficulty.easy),
      medium: this.calculateAverage(performanceByDifficulty.medium),
      hard: this.calculateAverage(performanceByDifficulty.hard),
    };

    if (avgPerformance.medium > DIFFICULTY_THRESHOLDS.HIGH_PERFORMANCE) {
      return 'hard';
    } else if (avgPerformance.medium < DIFFICULTY_THRESHOLDS.LOW_PERFORMANCE) {
      return 'easy';
    } else {
      return 'medium';
    }
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((a, b) => a + b, 0);
    return sum / numbers.length;
  }

  private async buildDailyChallenges(
    validQuizzes: any[],
    optimalDifficulty: string,
    start: Date,
    end: Date,
    systemUserId: string,
    existingTitles: Set<string>
  ): Promise<ChallengeData[]> {
    const challenges: ChallengeData[] = [];

    // 1. Topic-based Challenge (if valid quizzes exist)
    if (validQuizzes.length > 0) {
      const topicQuiz = validQuizzes[0];
      const title = `Daily Master: ${topicQuiz.topic}`;

      if (!existingTitles.has(title.toLowerCase())) {
        // Generate a random number of questions between 10 and 30
        const numberOfQuestions = Math.floor(Math.random() * 21) + 10; // 10-30 questions

        // Determine quiz type and time limit based on difficulty
        let quizType: QuizType;
        let timeLimit: number | null;

        if (optimalDifficulty === 'easy') {
          // Easy: Standard quiz
          quizType = QuizType.STANDARD;
        } else {
          // Medium/Hard: Randomly choose between timed test or scenario based
          const quizTypes = [QuizType.TIMED_TEST, QuizType.SCENARIO_BASED];
          quizType = quizTypes[Math.floor(Math.random() * quizTypes.length)];
        }

        // Strict Timing: All challenges must be timed
        // Easy: 45 seconds per question
        // Medium/Hard: 60 seconds per question (or standard timed test rule)
        if (quizType === QuizType.TIMED_TEST) {
          timeLimit = numberOfQuestions * 60;
        } else if (optimalDifficulty === 'easy') {
          timeLimit = numberOfQuestions * 45;
        } else {
          timeLimit = numberOfQuestions * 60; // Default for others
        }

        // Determine question types based on difficulty
        let questionTypes: string[];
        if (optimalDifficulty === 'easy') {
          // Easy: Only single-select and true/false
          questionTypes = ['single-select', 'true-false'];
        } else if (optimalDifficulty === 'medium') {
          // Medium: Add multi-select
          questionTypes = ['single-select', 'true-false', 'multi-select'];
        } else {
          // Hard: All question types including fill-blank and matching
          questionTypes = [
            'single-select',
            'true-false',
            'multi-select',
            'fill-blank',
            'matching',
          ];
        }

        // Generate a new quiz for this challenge using AI
        const prompt = await LangChainPrompts.quizGeneration.format({
          difficulty: (optimalDifficulty as string) || 'Medium',
          topic: topicQuiz.topic,
          sourceContentSection: LangChainPrompts.formatSourceContent(),
          questionCount: numberOfQuestions.toString(),
          questionTypes: `${quizType.toLowerCase()} - ${questionTypes.join(', ')}`,
          focusAreas: LangChainPrompts.formatFocusAreas(),
        });

        const generatedQuiz = await this.langchainService.invokeWithStructure(
          QuizGenerationSchema,
          prompt,
          {
            task: 'quiz',
            complexity: 'simple',
          }
        );

        // Save the quiz to the database
        const quiz = await this.prisma.quiz.create({
          data: {
            title,
            topic: topicQuiz.topic,
            difficulty: optimalDifficulty,
            quizType, // Use the enum value directly
            questions: QuizUtils.normalizeQuestions(
              generatedQuiz.questions
            ) as any,
            timeLimit, // Add time limit only for timed quizzes
            userId: systemUserId,
          },
        });

        challenges.push({
          title,
          description: `Master ${topicQuiz.topic} in today's daily challenge!`,
          type: 'daily',
          target: 100, // Score target
          reward: 100,
          startDate: start,
          endDate: end,
          quizId: quiz.id,
          format: 'STANDARD',
        });
      }
    }

    // 2. Consistency Challenge
    const streakTitle = 'Daily Streak Builder';
    if (!existingTitles.has(streakTitle.toLowerCase())) {
      challenges.push({
        title: streakTitle,
        description:
          'Complete at least one quiz today to keep your streak alive!',
        type: 'daily',
        target: 1,
        reward: 50,
        startDate: start,
        endDate: end,
        format: 'STANDARD',
      });
    }

    // 3. Mixed Challenge (General Knowledge or Random)
    const mixedTitle = 'Daily Mix';
    if (!existingTitles.has(mixedTitle.toLowerCase())) {
      const prompt = await LangChainPrompts.quizGeneration.format({
        difficulty: 'Medium',
        topic: 'General Knowledge',
        sourceContentSection: LangChainPrompts.formatSourceContent(),
        questionCount: '5',
        questionTypes: 'standard - single-select',
        focusAreas: LangChainPrompts.formatFocusAreas(),
      });

      const generatedQuiz = await this.langchainService.invokeWithStructure(
        QuizGenerationSchema,
        prompt,
        {
          task: 'quiz',
          complexity: 'simple',
        }
      );

      // Save the quiz to the database
      const quiz = await this.prisma.quiz.create({
        data: {
          title: mixedTitle,
          topic: 'General Knowledge',
          difficulty: 'medium',
          quizType: QuizType.QUICK_CHECK,
          questions: QuizUtils.normalizeQuestions(
            generatedQuiz.questions
          ) as any,
          userId: systemUserId,
        },
      });

      challenges.push({
        title: mixedTitle,
        description: 'A quick mix of questions to test your general knowledge.',
        type: 'daily',
        target: 80,
        reward: 75,
        startDate: start,
        endDate: end,
        quizId: quiz.id,
        format: 'STANDARD',
      });
    }

    return challenges;
  }

  private async saveChallenges(challenges: ChallengeData[]) {
    this.logger.log(`Saving ${challenges.length} challenges`);

    await this.prisma.$transaction(
      challenges.map((data, index) => {
        const { quizId, ...challengeData } = data;
        // Generate random max participants: 10, 20, ..., 100
        const maxParticipants = (Math.floor(Math.random() * 10) + 1) * 10;

        this.logger.debug(
          `Challenge ${index + 1}: ${data.title}, quizId: ${quizId || 'none'}, maxParticipants: ${maxParticipants}`
        );

        return this.prisma.challenge.create({
          data: {
            ...challengeData,
            maxParticipants,
            quizzes: quizId
              ? {
                  create: {
                    quizId,
                    order: 0,
                  },
                }
              : undefined,
          },
        });
      })
    );

    this.logger.log(`Successfully saved ${challenges.length} challenges`);
  }

  private calculateFinalScore(quizAttempts: QuizAttempt[]): number {
    if (quizAttempts.length === 0) return 0;
    const totalScore = quizAttempts.reduce(
      (sum, attempt) => sum + attempt.score,
      0
    );
    const totalQuestions = quizAttempts.reduce(
      (sum, attempt) => sum + attempt.totalQuestions,
      0
    );
    return Math.round((totalScore / totalQuestions) * 100);
  }

  private async calculatePercentile(
    challengeId: string,
    score: number
  ): Promise<number> {
    const betterScores = await this.prisma.challengeCompletion.count({
      where: {
        challengeId,
        finalScore: { lt: score },
        completed: true,
      },
    });

    const totalCompletions = await this.prisma.challengeCompletion.count({
      where: {
        challengeId,
        completed: true,
      },
    });

    if (totalCompletions === 0) return 100;

    return Math.round((betterScores / totalCompletions) * 100);
  }

  private async awardChallengeXP(userId: string, amount: number) {
    await this.leaderboardService.updateUserScore(userId, amount);
  }

  private calculateProgressUpdate(
    challenge: any,
    completion: any,
    type: 'quiz' | 'flashcard',
    isPerfect: boolean
  ): { shouldUpdate: boolean; newProgress: number } {
    let shouldUpdate = false;
    let newProgress = completion.progress;

    // Logic depends on challenge type/description
    // This is a simplified version. In a real app, we'd parse the challenge rules.

    if (challenge.type === 'daily') {
      if (challenge.title.includes('Master')) {
        // For "Master" challenges, we might require a perfect score or high score
        if (type === 'quiz' && isPerfect) {
          shouldUpdate = true;
          newProgress += 100; // Complete immediately
        }
      } else if (challenge.title.includes('Streak')) {
        // Just completing any quiz counts
        shouldUpdate = true;
        newProgress += 1;
      } else if (challenge.title.includes('Mix')) {
        // Points based on score? Or just completion?
        // Let's say we add points based on score (which we don't have here, so just +10 for now)
        shouldUpdate = true;
        newProgress += 10;
      }
    }

    return { shouldUpdate, newProgress };
  }

  private async invalidateUserCache(userId: string) {
    const keys = [
      this.getCacheKey('all', userId),
      this.getCacheKey('daily', userId, new Date()),
    ];

    await this.cacheService.invalidateMultiple(keys);
  }
}
