import { Test, TestingModule } from '@nestjs/testing';
import { FlashcardGenerationStrategy } from './strategies/flashcard-generation.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { CacheService } from '../common/services/cache.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { InputPipeline } from '../input-pipeline/input-pipeline.service';
import { DatabaseBufferService } from '../common/services/database-buffer.service';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { FlashcardService } from './flashcard.service';

const mockInputPipeline = {
  process: jest.fn().mockResolvedValue([]),
  combineInputSources: jest.fn().mockReturnValue('Combined Context'),
};

describe('Flashcard Generation Integration Flow', () => {
  let strategy: FlashcardGenerationStrategy;
  let langchainService: DeepMockProxy<LangChainService>;
  let prisma: DeepMockProxy<PrismaService>;
  let queue: DeepMockProxy<Queue>;

  const USER_ID = 'user-123';
  const MOCK_JOB = {
    id: 'job-flashcard-1',
    data: {
      userId: USER_ID,
      dto: {
        topic: 'Integration Flashcards',
        numberOfCards: 5,
      },
      contentHash: 'hash-123',
    },
    updateProgress: jest.fn(),
    log: jest.fn(),
  } as unknown as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardGenerationStrategy,
        { provide: FlashcardService, useValue: mockDeep<FlashcardService>() },
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
        { provide: LangChainService, useValue: mockDeep<LangChainService>() },
        { provide: CacheService, useValue: mockDeep<CacheService>() },
        { provide: StudyPackService, useValue: mockDeep<StudyPackService>() },
        { provide: InputPipeline, useValue: mockInputPipeline },
        {
          provide: DatabaseBufferService,
          useValue: mockDeep<DatabaseBufferService>(),
        },
        { provide: EventEmitter2, useValue: mockDeep<EventEmitter2>() },
        {
          provide: getQueueToken('flashcard-generation'),
          useValue: mockDeep<Queue>(),
        },
      ],
    }).compile();

    strategy = module.get(FlashcardGenerationStrategy);
    langchainService = module.get(LangChainService);
    prisma = module.get(PrismaService);
    queue = module.get(getQueueToken('flashcard-generation'));
  });

  describe('End-to-End Generation Flow', () => {
    it('should generate flashcards logic and save initial chunk', async () => {
      // Mock AI
      langchainService.invokeWithJsonParser.mockResolvedValue({
        cards: [
          { front: 'Question 1', back: 'Answer 1' },
          { front: 'Question 2', back: 'Answer 2' },
        ],
        title: 'Generated Set',
        topic: 'Integration Flashcards',
      });

      // Mock Prisma Create
      prisma.flashcardSet.create.mockResolvedValue({
        id: 'set-1',
        title: 'Generated Set',
        userId: USER_ID,
      } as any);

      // 1. PreProcess
      const context = await strategy.preProcess(MOCK_JOB);
      expect(context.contentForAI).toBe('Combined Context');

      // 2. Execute
      const result = await strategy.execute(context as any);
      expect(result.cards).toHaveLength(2);
      expect(result.title).toBe('Generated Set');

      // 3. PostProcess
      await strategy.postProcess(context as any, result);

      expect(prisma.flashcardSet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Generated Set',
            userId: USER_ID,
            cards: expect.arrayContaining([
              { front: 'Question 1', back: 'Answer 1' },
            ]),
          }),
        })
      );
    });
  });
});
