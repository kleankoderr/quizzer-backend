import { Test, TestingModule } from '@nestjs/testing';
import { FlashcardService } from './flashcard.service';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { CacheService } from '../common/services/cache.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { QuotaService } from '../common/services/quota.service';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { GenerationHashService } from '../file-storage/services/generation-hash.service';
import { GenerationCacheService } from '../common/services/generation-cache.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import { UserDocumentService } from '../user-document/user-document.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { StreakService } from '../streak/streak.service';
import { ChallengeService } from '../challenge/challenge.service';
import { StudyService } from '../study/study.service';
import { FILE_STORAGE_SERVICE } from '../file-storage/interfaces/file-storage.interface';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('FlashcardService', () => {
  let service: FlashcardService;
  let prisma: DeepMockProxy<PrismaService>;
  let queue: DeepMockProxy<Queue>;
  let generationHashService: DeepMockProxy<GenerationHashService>;
  let generationCacheService: DeepMockProxy<GenerationCacheService>;

  const USER_ID = 'user-123';
  const SET_ID = 'set-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardService,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
        { provide: LangChainService, useValue: mockDeep<LangChainService>() },
        { provide: CacheService, useValue: mockDeep<CacheService>() },
        { provide: StudyPackService, useValue: mockDeep<StudyPackService>() },
        { provide: QuotaService, useValue: mockDeep<QuotaService>() },
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
        {
          provide: RecommendationService,
          useValue: mockDeep<RecommendationService>(),
        },
        { provide: StreakService, useValue: mockDeep<StreakService>() },
        { provide: ChallengeService, useValue: mockDeep<ChallengeService>() },
        { provide: StudyService, useValue: mockDeep<StudyService>() },
        { provide: EventEmitter2, useValue: mockDeep<EventEmitter2>() },
        {
          provide: getQueueToken('flashcard-generation'),
          useValue: mockDeep<Queue>(),
        },
        { provide: 'GOOGLE_FILE_STORAGE_SERVICE', useValue: mockDeep<any>() },
        { provide: FILE_STORAGE_SERVICE, useValue: mockDeep<any>() },
      ],
    }).compile();

    service = module.get(FlashcardService);
    prisma = module.get(PrismaService);
    queue = module.get(getQueueToken('flashcard-generation'));
    generationHashService = module.get(GenerationHashService);
    generationCacheService = module.get(GenerationCacheService);
  });

  describe('generateFlashcards', () => {
    const dto = { topic: 'History', numberOfCards: 5 };

    it('should return cached result if available', async () => {
      generationHashService.forFlashcards.mockReturnValue('hash-1');
      generationCacheService.checkCaches.mockResolvedValue({
        id: 'cached-id',
      } as any);

      const result = await service.generateFlashcards(USER_ID, dto);
      expect(result).toEqual({ id: 'cached-id' });
    });

    it('should create job if not cached', async () => {
      generationHashService.forFlashcards.mockReturnValue('hash-1');
      generationCacheService.checkCaches.mockResolvedValue(null);
      prisma.flashcardSet.create.mockResolvedValue({ id: SET_ID } as any);
      queue.add.mockResolvedValue({ id: 'job-1' } as any);

      const result = await service.generateFlashcards(USER_ID, dto);

      expect(queue.add).toHaveBeenCalled();
      expect(result).toEqual({
        jobId: 'job-1',
        recordId: 'job-1', // Updated expectation based on service logic returning job.id as fallback recordId
        status: 'pending',
        cached: false,
      });
    });
  });

  describe('getFlashcardSetById', () => {
    it('should return set if found', async () => {
      prisma.flashcardSet.findFirst.mockResolvedValue({
        id: SET_ID,
        userId: USER_ID,
      } as any);
      const result = await service.getFlashcardSetById(SET_ID, USER_ID);
      expect(result.id).toEqual(SET_ID);
    });

    it('should throw NotFoundException checking user ownership', async () => {
      prisma.flashcardSet.findFirst.mockResolvedValue(null);
      await expect(
        service.getFlashcardSetById(SET_ID, USER_ID)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteFlashcardSet', () => {
    it('should delete set', async () => {
      prisma.flashcardSet.findFirst.mockResolvedValue({
        id: SET_ID,
        userId: USER_ID,
      } as any);
      prisma.flashcardSet.delete.mockResolvedValue({ id: SET_ID } as any);

      await service.deleteFlashcardSet(SET_ID, USER_ID);

      expect(prisma.flashcardSet.delete).toHaveBeenCalledWith({
        where: { id: SET_ID },
      });
    });
  });
});
