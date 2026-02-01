import { Test, TestingModule } from '@nestjs/testing';
import { QuizService } from './quiz.service';
import { QuizGenerationStrategy } from './strategies/quiz-generation.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { CacheService } from '../common/services/cache.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { QuotaService } from '../common/services/quota.service';
import { InputPipeline } from '../input-pipeline/input-pipeline.service';
import { DatabaseBufferService } from '../common/services/database-buffer.service';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { RecommendationService } from '../recommendation/recommendation.service';
import { StreakService } from '../streak/streak.service';
import { StudyService } from '../study/study.service';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { GenerationHashService } from '../file-storage/services/generation-hash.service';
import { GenerationCacheService } from '../common/services/generation-cache.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import { UserDocumentService } from '../user-document/user-document.service';
import { FILE_STORAGE_SERVICE } from '../file-storage/interfaces/file-storage.interface';

// Mock InputPipeline explicitly
const mockInputPipeline = {
  process: jest.fn().mockResolvedValue([]),
  combineInputSources: jest.fn().mockReturnValue('Combined Context'),
};

describe('Quiz Generation Integration Flow', () => {
  let quizService: QuizService;
  let strategy: QuizGenerationStrategy;
  let prisma: DeepMockProxy<PrismaService>;
  let langchainService: DeepMockProxy<LangChainService>;
  let queue: DeepMockProxy<Queue>;
  let generationHashService: DeepMockProxy<GenerationHashService>;

  const USER_ID = 'user-123';
  const MOCK_JOB = {
    id: 'job-123',
    data: {
      userId: USER_ID,
      dto: {
        topic: 'Integration Test',
        numberOfQuestions: 5,
        difficulty: 'medium',
      },
    },
    updateProgress: jest.fn(),
    log: jest.fn(),
  } as unknown as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        QuizGenerationStrategy,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
        { provide: LangChainService, useValue: mockDeep<LangChainService>() },
        { provide: CacheService, useValue: mockDeep<CacheService>() },
        { provide: StudyPackService, useValue: mockDeep<StudyPackService>() },
        { provide: QuotaService, useValue: mockDeep<QuotaService>() },
        { provide: InputPipeline, useValue: mockInputPipeline },
        {
          provide: DatabaseBufferService,
          useValue: mockDeep<DatabaseBufferService>(),
        },
        { provide: EventEmitter2, useValue: mockDeep<EventEmitter2>() },
        {
          provide: getQueueToken('quiz-generation'),
          useValue: mockDeep<Queue>(),
        },
        // Add all other dependencies for QuizService (copied from unit test)
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

    quizService = module.get(QuizService);
    strategy = module.get(QuizGenerationStrategy);
    prisma = module.get(PrismaService);
    langchainService = module.get(LangChainService);
    queue = module.get(getQueueToken('quiz-generation'));
    generationHashService = module.get(GenerationHashService);
  });

  describe('End-to-End Generation Flow', () => {
    it('should successfully generate and save a quiz', async () => {
      // 1. Setup Data
      const generatedQuestions = [
        { question: 'Q1', correctAnswer: 'A', options: ['A', 'B'] },
        { question: 'Q2', correctAnswer: 'B', options: ['A', 'B'] },
      ];

      // 2. Mock Logic Interactions
      // Hash check
      generationHashService.forQuiz.mockReturnValue('hash-int-1');

      // AI Response
      langchainService.invokeWithJsonParser.mockResolvedValue({
        title: 'Generated Quiz',
        topic: 'Integration Test',
        questions: generatedQuestions,
      });

      // Prisma Interactions
      prisma.quiz.create.mockResolvedValue({
        id: 'new-quiz-id',
        title: 'Generated Quiz',
        userId: USER_ID,
      } as any);

      // 3. Execution (Simulate Processor Steps)

      // Step A: PreProcess
      const context = await strategy.preProcess(MOCK_JOB);
      expect(context.contentForAI).toBe('Combined Context');

      // Step B: Execute (AI Generation)
      const result = await strategy.execute(context as any);
      expect(result.questions).toHaveLength(2);
      expect(result.title).toBe('Generated Quiz');

      // Step C: PostProcess (Persistence)
      await strategy.postProcess(context as any, result);

      expect(prisma.quiz.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Generated Quiz',
            userId: USER_ID,
            questions: expect.arrayContaining([
              expect.objectContaining({ question: 'Q1' }),
            ]),
          }),
        })
      );
    });

    it('should handle concurrency by utilizing pending job checks', async () => {
      // Logic for concurrency is in Service, utilizing Cache/DB
      // We simulate multiple calls to service.generateQuiz

      // Setup
      generationHashService.forQuiz.mockReturnValue('stable-hash');

      // First call: Not cached, creates job
      const cacheService = (quizService as any).generationCacheService;
      cacheService.checkCaches.mockResolvedValueOnce(null);
      queue.add.mockResolvedValueOnce({ id: 'job-1' } as any);

      const res1 = await quizService.generateQuiz(USER_ID, {
        topic: 'Concurrent',
        numberOfQuestions: 5,
        difficulty: 'medium',
      });

      // Second call: Cached as pending
      cacheService.checkCaches.mockResolvedValueOnce({
        jobId: 'job-1',
        status: 'pending',
        cached: true,
      });

      const res2 = await quizService.generateQuiz(USER_ID, {
        topic: 'Concurrent',
        numberOfQuestions: 5,
        difficulty: 'medium',
      });

      expect(res1.jobId).toBe('job-1');
      expect(res2.jobId).toBe('job-1'); // Should return same job
      expect(queue.add).toHaveBeenCalledTimes(1); // Only one job actually queued
    });

    it('should handle AI failures gracefully', async () => {
      // Mock PreProcess success
      const context = await strategy.preProcess(MOCK_JOB);

      // Mock AI Failure
      langchainService.invokeWithJsonParser.mockRejectedValue(
        new Error('AI Service Down')
      );

      await expect(strategy.execute(context as any)).rejects.toThrow(
        'Failed to generate quiz. Please try again.'
      );
    });
  });
});
