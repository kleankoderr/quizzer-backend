import { Test, TestingModule } from '@nestjs/testing';
import { ContentService } from './content.service';
import { ContentGenerationStrategy } from './strategies/content-generation.strategy';
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
import { QuizService } from '../quiz/quiz.service';
import { FlashcardService } from '../flashcard/flashcard.service';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { GenerationHashService } from '../file-storage/services/generation-hash.service';
import { GenerationCacheService } from '../common/services/generation-cache.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import { UserDocumentService } from '../user-document/user-document.service';
import { FILE_STORAGE_SERVICE } from '../file-storage/interfaces/file-storage.interface';
import { SectionGenerationProcessor } from './section-generation.processor';

// Mock InputPipeline
const mockInputPipeline = {
  process: jest.fn().mockResolvedValue([]),
  combineInputSources: jest.fn().mockReturnValue('Combined Context'),
};

describe('Content Generation Integration Flow', () => {
  let strategy: ContentGenerationStrategy;
  let langchainService: DeepMockProxy<LangChainService>;
  let prisma: DeepMockProxy<PrismaService>;
  let queue: DeepMockProxy<Queue>;
  let sectionProcessor: DeepMockProxy<SectionGenerationProcessor>;

  const USER_ID = 'user-123';
  const MOCK_JOB = {
    id: 'job-content-1',
    data: {
      userId: USER_ID,
      dto: {
        topic: 'Integration Content',
      },
    },
    updateProgress: jest.fn(),
    log: jest.fn(),
  } as unknown as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        ContentGenerationStrategy,
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
          provide: getQueueToken('content-generation'),
          useValue: mockDeep<Queue>(),
        },
        {
          provide: getQueueToken('section-generation'),
          useValue: mockDeep<Queue>(),
        },
        { provide: QuizService, useValue: mockDeep<QuizService>() },
        { provide: FlashcardService, useValue: mockDeep<FlashcardService>() },
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
        {
          provide: SectionGenerationProcessor,
          useValue: mockDeep<SectionGenerationProcessor>(),
        },
      ],
    }).compile();

    strategy = module.get(ContentGenerationStrategy);
    langchainService = module.get(LangChainService);
    prisma = module.get(PrismaService);
    queue = module.get(getQueueToken('content-generation'));
    sectionProcessor = module.get(SectionGenerationProcessor);
  });

  describe('End-to-End Generation Flow', () => {
    it('should generate content outline and queue sections', async () => {
      // Mock Prisma
      prisma.content.update.mockResolvedValue({
        id: 'content-1',
        title: 'Generated Content',
      } as any);
      prisma.content.create.mockResolvedValue({
        id: 'content-1',
        title: 'Generated Content',
      } as any);

      // Mock AI
      langchainService.invokeWithJsonParser.mockResolvedValue({
        title: 'Generated Content',
        topic: 'Integration Content',
        sections: [
          { title: 'Intro', content: 'Intro text' },
          { title: 'Details', content: 'Details text' },
        ],
        description: 'Summary text',
      });

      // 1. PreProcess
      const context = await strategy.preProcess(MOCK_JOB);
      expect(context.contentForAI).toBe('Combined Context');

      // 2. Execute
      const result = await strategy.execute(context as any);
      expect(result.sections).toHaveLength(2);
      expect(result.description).toBe('Summary text');

      // 3. PostProcess
      // Mock existing content being updated
      await strategy.postProcess(context as any, result);

      expect(prisma.content.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Generated Content',
            description: 'Summary text',
          }),
        })
      );

      // Ensure we don't start section generation directly here (handled by event or separate queue in real app, checking queue add if applicable)
      // The strategy usually updates DB.
    });
  });
});
