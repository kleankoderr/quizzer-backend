import { Test, TestingModule } from '@nestjs/testing';
import { ContentService } from './content.service';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { QuizService } from '../quiz/quiz.service';
import { FlashcardService } from '../flashcard/flashcard.service';
import { CacheService } from '../common/services/cache.service';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { GenerationHashService } from '../file-storage/services/generation-hash.service';
import { GenerationCacheService } from '../common/services/generation-cache.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import { UserDocumentService } from '../user-document/user-document.service';
import { FILE_STORAGE_SERVICE } from '../file-storage/interfaces/file-storage.interface';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotFoundException } from '@nestjs/common';

describe('ContentService', () => {
  let service: ContentService;
  let prisma: DeepMockProxy<PrismaService>;
  let langchainService: DeepMockProxy<LangChainService>;
  let cacheService: DeepMockProxy<CacheService>;

  const USER_ID = 'user-123';
  const CONTENT_ID = 'content-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
        { provide: LangChainService, useValue: mockDeep<LangChainService>() },
        { provide: QuizService, useValue: mockDeep<QuizService>() },
        { provide: FlashcardService, useValue: mockDeep<FlashcardService>() },
        { provide: CacheService, useValue: mockDeep<CacheService>() },
        { provide: QuotaService, useValue: mockDeep<QuotaService>() },
        { provide: StudyPackService, useValue: mockDeep<StudyPackService>() },
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
          provide: getQueueToken('content-generation'),
          useValue: mockDeep<Queue>(),
        },
        { provide: 'GOOGLE_FILE_STORAGE_SERVICE', useValue: mockDeep<any>() },
        { provide: FILE_STORAGE_SERVICE, useValue: mockDeep<any>() },
      ],
    }).compile();

    service = module.get(ContentService);
    prisma = module.get(PrismaService);
    langchainService = module.get(LangChainService);
    cacheService = module.get(CacheService);
  });

  describe('getContentById', () => {
    it('should return content if found', async () => {
      const mockContent = { id: CONTENT_ID, userId: USER_ID, title: 'Found' };
      prisma.content.findUnique.mockResolvedValue(mockContent as any);

      const result = await service.getContentById(USER_ID, CONTENT_ID);
      expect(result.id).toBe(CONTENT_ID);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.content.findUnique.mockResolvedValue(null);
      await expect(service.getContentById(USER_ID, CONTENT_ID)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('generateExplanation', () => {
    it('should return cached explanation if exists', async () => {
      cacheService.get.mockResolvedValue('Cached Explanation');
      const result = await service.generateExplanation(
        USER_ID,
        CONTENT_ID,
        'Section',
        'Text'
      );
      expect(result).toBe('Cached Explanation');
      expect(langchainService.invoke).not.toHaveBeenCalled();
    });

    it('should call langchain and cache if not cached', async () => {
      cacheService.get.mockResolvedValue(null);
      langchainService.invoke.mockResolvedValue('AI Explanation');
      prisma.content.findFirst.mockResolvedValue({
        id: CONTENT_ID,
        userId: USER_ID,
        learningGuide: { sections: [{ title: 'Section' }] },
      } as any);

      const result = await service.generateExplanation(
        USER_ID,
        CONTENT_ID,
        'Section',
        'Text'
      );

      expect(result).toBe('AI Explanation');
      expect(cacheService.set).toHaveBeenCalled();
      expect(prisma.content.update).toHaveBeenCalled();
    });
  });

  describe('generateExample', () => {
    it('should call langchain and cache', async () => {
      cacheService.get.mockResolvedValue(null);
      langchainService.invoke.mockResolvedValue('AI Example');
      prisma.content.findFirst.mockResolvedValue({
        id: CONTENT_ID,
        userId: USER_ID,
        learningGuide: { sections: [{ title: 'Section' }] },
      } as any);

      const result = await service.generateExample(
        USER_ID,
        CONTENT_ID,
        'Section',
        'Text'
      );

      expect(result).toBe('AI Example');
      expect(cacheService.set).toHaveBeenCalled();
      expect(prisma.content.update).toHaveBeenCalled();
    });
  });

  describe('deleteContent', () => {
    it('should delete keys and invalidate cache', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: CONTENT_ID,
        userId: USER_ID,
      } as any);
      prisma.content.delete.mockResolvedValue({ id: CONTENT_ID } as any);

      await service.deleteContent(USER_ID, CONTENT_ID);

      expect(prisma.content.delete).toHaveBeenCalledWith({
        where: { id: CONTENT_ID },
      });
    });
  });
});
