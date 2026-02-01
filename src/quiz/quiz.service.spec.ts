import { Test, TestingModule } from '@nestjs/testing';
import { QuizService } from './quiz.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { CacheService } from '../common/services/cache.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { QuotaService } from '../common/services/quota.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { StreakService } from '../streak/streak.service';
import { StudyService } from '../study/study.service';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { GenerationHashService } from '../file-storage/services/generation-hash.service';
import { GenerationCacheService } from '../common/services/generation-cache.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import { UserDocumentService } from '../user-document/user-document.service';
import { FILE_STORAGE_SERVICE } from '../file-storage/interfaces/file-storage.interface';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Queue } from 'bullmq';

describe('QuizService', () => {
  let service: QuizService;
  let prisma: DeepMockProxy<PrismaService>;
  let queue: DeepMockProxy<Queue>;
  let cacheService: DeepMockProxy<CacheService>;
  let generationHashService: DeepMockProxy<GenerationHashService>;
  let generationCacheService: DeepMockProxy<GenerationCacheService>;

  const USER_ID = 'user-123';
  const QUIZ_ID = 'quiz-123';
  const JOB_ID = 'job-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
        {
          provide: getQueueToken('quiz-generation'),
          useValue: mockDeep<Queue>(),
        },
        { provide: CacheService, useValue: mockDeep<CacheService>() },
        { provide: StudyPackService, useValue: mockDeep<StudyPackService>() },
        { provide: QuotaService, useValue: mockDeep<QuotaService>() },
        {
          provide: RecommendationService,
          useValue: mockDeep<RecommendationService>(),
        },
        { provide: StreakService, useValue: mockDeep<StreakService>() },
        { provide: StudyService, useValue: mockDeep<StudyService>() },
        {
          provide: DocumentHashService,
          useValue: mockDeep<DocumentHashService>(),
        },
        {
          provide: GenerationHashService,
          useValue: mockDeep<GenerationHashService>(),
        },
        {
          provide: GenerationCacheService,
          useValue: mockDeep<GenerationCacheService>(),
        },
        {
          provide: FileCompressionService,
          useValue: mockDeep<FileCompressionService>(),
        },
        {
          provide: UserDocumentService,
          useValue: mockDeep<UserDocumentService>(),
        },
        { provide: 'GOOGLE_FILE_STORAGE_SERVICE', useValue: mockDeep<any>() },
        { provide: FILE_STORAGE_SERVICE, useValue: mockDeep<any>() },
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
    prisma = module.get(PrismaService);
    queue = module.get(getQueueToken('quiz-generation'));
    cacheService = module.get(CacheService);
    generationHashService = module.get(GenerationHashService);
    generationCacheService = module.get(GenerationCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateQuiz', () => {
    const dto: any = {
      topic: 'Math',
      numberOfQuestions: 10,
      difficulty: 'medium',
    };

    it('should return cached result if verification passes', async () => {
      generationHashService.forQuiz.mockReturnValue('hash-123');
      generationCacheService.checkCaches.mockResolvedValue({
        jobId: JOB_ID,
        status: 'completed',
        cached: true,
      });

      const result = await service.generateQuiz(USER_ID, dto);

      expect(result).toEqual({
        jobId: JOB_ID,
        status: 'completed',
        cached: true,
      });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should create a new job if not cached', async () => {
      generationHashService.forQuiz.mockReturnValue('hash-123');
      generationCacheService.checkCaches.mockResolvedValue(null);
      queue.add.mockResolvedValue({ id: JOB_ID } as any);

      // Mock user document fetching (empty list)
      (service as any).fetchSelectedFiles = jest.fn().mockResolvedValue([]);
      (service as any).processUploadedFiles = jest.fn().mockResolvedValue([]);

      const result = await service.generateQuiz(USER_ID, dto);

      expect(queue.add).toHaveBeenCalledWith(
        'generate',
        expect.objectContaining({
          contentHash: 'hash-123',
          userId: USER_ID,
        })
      );
      expect(result.jobId).toBe(JOB_ID);
      expect(cacheService.set).toHaveBeenCalled(); // Should cache pending job
    });
  });

  describe('submitQuiz', () => {
    const dto = {
      answers: ['A', 'B'],
      challengeId: undefined,
    };

    const mockQuiz = {
      id: QUIZ_ID,
      topic: 'Test',
      questions: [
        { id: '1', correctAnswer: 'A', question: 'Q1', options: ['A', 'B'] },
        { id: '2', correctAnswer: 'B', question: 'Q2', options: ['A', 'B'] },
      ],
      tags: [],
      contentId: null,
    };

    it('should grade quiz and create attempt', async () => {
      // Mock finding quiz
      prisma.user.findUnique.mockResolvedValue({ schoolId: null } as any);
      prisma.quiz.findFirst.mockResolvedValue(mockQuiz as any);

      // Mock duplicate check
      prisma.attempt.findFirst.mockResolvedValue(null);

      // Mock creation
      prisma.attempt.create.mockResolvedValue({
        id: 'attempt-1',
        score: 2,
      } as any);

      // Mock stats
      prisma.attempt.aggregate.mockResolvedValue({ _count: { id: 10 } } as any);
      prisma.attempt.count.mockResolvedValue(5);

      // Mock async handlers to return Promises
      (service as any).streakService.updateStreak.mockResolvedValue();
      (
        service as any
      ).recommendationService.generateAndStoreRecommendations.mockResolvedValue();
      (service as any).studyService.updateProgress.mockResolvedValue();
      cacheService.invalidate.mockResolvedValue();

      const result = await service.submitQuiz(USER_ID, QUIZ_ID, dto);

      expect(result.score).toBe(2);
      expect(result.percentage).toBe(100);
      expect(prisma.attempt.create).toHaveBeenCalled();
    });

    it('should handle duplicate submissions', async () => {
      prisma.attempt.findFirst.mockResolvedValue({
        id: 'existing-attempt',
        score: 2,
        totalQuestions: 2,
      } as any);
      prisma.quiz.findFirst.mockResolvedValue(mockQuiz as any);
      prisma.user.findUnique.mockResolvedValue({ schoolId: null } as any);

      const result = await service.submitQuiz(USER_ID, QUIZ_ID, dto);

      expect(result.feedback.message).toContain('already submitted');
      expect(prisma.attempt.create).not.toHaveBeenCalled();
    });
  });
});
