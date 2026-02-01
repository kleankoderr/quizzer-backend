import { Test, TestingModule } from '@nestjs/testing';
import { ContentService } from './content.service';
import { GenerationCacheService } from '../common/services/generation-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/services/cache.service';
import { GenerationHashService } from '../file-storage/services/generation-hash.service';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { mockDeep } from 'jest-mock-extended';
import { UserDocumentService } from '../user-document/user-document.service';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { LangChainService } from '../langchain/langchain.service';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import { QuizService } from '../quiz/quiz.service';
import { FlashcardService } from '../flashcard/flashcard.service';
import { FILE_STORAGE_SERVICE } from '../file-storage/interfaces/file-storage.interface';
import * as FileUploadHelpers from '../common/helpers/file-upload.helpers';

jest.mock('../common/helpers/file-upload.helpers');

describe('Content Deduplication & Reuse', () => {
  let contentService: ContentService;
  let generationCacheService: GenerationCacheService;
  let generationHashService: GenerationHashService;
  let prismaService: any;
  let cacheService: any;
  let queue: any;

  const USER_A = 'user-a-uuid';
  const USER_B = 'user-b-uuid';
  const CONTENT_HASH = 'stable-content-hash-123';
  const EXISTING_CONTENT_ID = 'content-id-aaa';
  const JOB_ID = 'job-id-111';

  beforeEach(async () => {
    prismaService = mockDeep<PrismaService>();
    cacheService = mockDeep<CacheService>();
    queue = mockDeep<Queue>();

    // Mock CacheService.get/set defaults
    cacheService.get.mockResolvedValue(null);
    cacheService.set.mockResolvedValue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        GenerationCacheService,
        GenerationHashService,
        { provide: PrismaService, useValue: prismaService },
        { provide: CacheService, useValue: cacheService },
        { provide: getQueueToken('content-generation'), useValue: queue },
        { provide: UserDocumentService, useValue: mockDeep() },
        { provide: QuotaService, useValue: mockDeep() },
        { provide: StudyPackService, useValue: mockDeep() },
        { provide: LangChainService, useValue: mockDeep() },
        { provide: DocumentHashService, useValue: mockDeep() },
        { provide: FileCompressionService, useValue: mockDeep() },
        { provide: QuizService, useValue: mockDeep() },
        { provide: FlashcardService, useValue: mockDeep() },
        { provide: 'GOOGLE_FILE_STORAGE_SERVICE', useValue: mockDeep() },
        { provide: FILE_STORAGE_SERVICE, useValue: mockDeep() },
      ],
    }).compile();

    contentService = module.get<ContentService>(ContentService);
    generationCacheService = module.get<GenerationCacheService>(
      GenerationCacheService
    );
    generationHashService = module.get<GenerationHashService>(
      GenerationHashService
    );

    // Mock GenerationHashService to return stable hash
    jest
      .spyOn(module.get(GenerationHashService), 'forContent')
      .mockReturnValue(CONTENT_HASH);
  });

  describe('Scenario: New Content Generation (Case D)', () => {
    it('should create a new job if content does not exist and no pending job', async () => {
      // Setup: No cache, no DB entry
      cacheService.get.mockResolvedValue(null); // No pending job
      prismaService.content.findFirst.mockResolvedValue(null); // No completed content
      prismaService.content.create.mockResolvedValue({ id: 'new-content-id' });
      queue.add.mockResolvedValue({ id: 'new-job-id' });

      const result = await contentService.generate(USER_A, {
        topic: 'New Topic',
      });

      expect(result.status).toBe('pending');
      expect(result.jobId).toBe('new-job-id');
      expect(queue.add).toHaveBeenCalled(); // Job added
      expect(prismaService.content.create).toHaveBeenCalled(); // Record created
      // Verify pending job is set with USER-SCOPED key
      expect(cacheService.set).toHaveBeenCalledWith(
        `pending-job:content:${USER_A}:${CONTENT_HASH}`,
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Scenario: Pending Job Reuse (Case C)', () => {
    it('should return existing job ID if SAME USER has a pending job', async () => {
      // Setup: Pending job exists for User A
      cacheService.get.mockImplementation((key: string) => {
        if (key === `pending-job:content:${USER_A}:${CONTENT_HASH}`) {
          return { jobId: JOB_ID, recordId: existingContentId };
        }
        return null;
      });
      const existingContentId = 'pending-content-id';

      const result = await contentService.generate(USER_A, {
        topic: 'Same Topic',
      });

      expect(result.status).toBe('pending');
      expect(result.jobId).toBe(JOB_ID); // Reused Job ID
      expect(result.cached).toBe(false);
      expect(queue.add).not.toHaveBeenCalled(); // No new job
    });

    it('should create NEW job if DIFFERENT USER has a pending job (User Scoping)', async () => {
      // Setup: User A has pending job, User B requests same thing
      // The cache svc logic scopes by user, so User B's lookup will miss User A's key
      cacheService.get.mockImplementation((key: string) => {
        // User B's key returns null
        if (key === `pending-job:content:${USER_B}:${CONTENT_HASH}`) {
          return null;
        }
        return null;
      });

      prismaService.content.findFirst.mockResolvedValue(null); // No completed content yet
      prismaService.content.create.mockResolvedValue({ id: 'content-id-bbb' });
      queue.add.mockResolvedValue({ id: 'job-id-bbb' });

      const result = await contentService.generate(USER_B, {
        topic: 'Same Topic',
      });

      expect(result.jobId).toBe('job-id-bbb'); // New Job
      // Verify we set a new pending key for User B
      expect(cacheService.set).toHaveBeenCalledWith(
        `pending-job:content:${USER_B}:${CONTENT_HASH}`,
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Scenario: Completed Content Reuse (Cases A & B)', () => {
    const COMPLETED_CONTENT = {
      id: EXISTING_CONTENT_ID,
      title: 'Topics',
      topic: 'Topic',
      content: 'Generated text',
      description: 'Desc',
      userId: USER_A, // Owner is User A
      learningGuide: {
        sections: [
          { content: 'Real content...' },
          {
            content:
              'More content that is definitely longer than fifty characters to ensure the validation logic accepts it as a completed generation for the purpose of this test case.',
          },
        ],
      },
    };

    it('should return EXISTING record if SAME USER requests completed content (Case B)', async () => {
      // Setup: DB has completed content for User A
      prismaService.content.findFirst.mockResolvedValue(COMPLETED_CONTENT);

      const result = await contentService.generate(USER_A, { topic: 'Topic' });

      expect(result.status).toBe('completed');
      expect(result.recordId).toBe(EXISTING_CONTENT_ID);
      expect(prismaService.content.create).not.toHaveBeenCalled(); // No cloning
    });

    it('should CLONE content if DIFFERENT USER requests completed content (Case A)', async () => {
      // Setup: DB has completed content for User A
      prismaService.content.findFirst.mockResolvedValue(COMPLETED_CONTENT);
      // Mock create to return new clone
      prismaService.content.create.mockResolvedValue({
        ...COMPLETED_CONTENT,
        id: 'content-id-cloned',
        userId: USER_B,
      });

      const result = await contentService.generate(USER_B, { topic: 'Topic' });

      expect(result.status).toBe('completed');
      expect(result.recordId).toBe('content-id-cloned'); // New ID
      expect(prismaService.content.create).toHaveBeenCalled(); // Cloning happened
      // Verify clone data (checking a subset of fields)
      const createCall = prismaService.content.create.mock.calls[0][0];
      expect(createCall.data.contentHash).toBe(CONTENT_HASH);
      expect(createCall.data.userId).toBe(USER_B);
    });
  });

  describe('Scenario: Edge Cases', () => {
    it('should handle concurrent requests from SAME USER by reusing the pending job', async () => {
      cacheService.get.mockResolvedValueOnce(null);
      prismaService.content.findFirst.mockResolvedValue(null);
      prismaService.content.create.mockResolvedValue({ id: 'content-race' });
      queue.add.mockResolvedValue({ id: 'job-race-1' });

      cacheService.get.mockImplementationOnce(async () => ({
        jobId: 'job-race-1',
      }));

      const [res1, res2] = await Promise.all([
        contentService.generate(USER_A, { topic: 'Race Topic' }),
        contentService.generate(USER_A, { topic: 'Race Topic' }),
      ]);

      expect(res1.jobId).toBe('job-race-1');
      expect(res2.jobId).toBe('job-race-1');
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('should handle empty file input gracefully', async () => {
      cacheService.get.mockResolvedValue(null);
      prismaService.content.findFirst.mockResolvedValue(null);
      queue.add.mockResolvedValue({ id: 'job-empty-1' });

      // Logic validation: validateContentRequest handles checking if inputs are empty.
      // If we pass empty string for topic and no content, it should throw BadRequest.
      await expect(
        contentService.generate(USER_A, { topic: '' })
      ).rejects.toThrow();
    });
  });

  describe('Scenario: File Inputs', () => {
    const MOCK_FILE = {
      originalname: 'test.pdf',
      buffer: Buffer.from('test'),
      mimetype: 'application/pdf',
      size: 1234,
    } as Express.Multer.File;

    const PROCESSED_DOC = {
      originalName: 'test.pdf',
      cloudinaryUrl: 'url',
      cloudinaryId: 'cid',
      hash: 'filehash',
      isDuplicate: false,
      documentId: 'doc-id-123',
      mimeType: 'application/pdf',
      size: 1234,
    };

    it('should link uploaded files to UserDocument and include in hash', async () => {
      // Setup
      cacheService.get.mockResolvedValue(null);
      prismaService.content.findFirst.mockResolvedValue(null);
      prismaService.content.create.mockResolvedValue({ id: 'content-file' });
      queue.add.mockResolvedValue({ id: 'job-file' });

      // Mock helper
      (FileUploadHelpers.processFileUploads as jest.Mock).mockResolvedValue([
        PROCESSED_DOC,
      ]);

      // Mock UserDocument creation
      const userDocumentService = (contentService as any).userDocumentService;
      userDocumentService.createUserDocument.mockResolvedValue({ id: 'ud-1' });

      await contentService.generate(USER_A, {}, [MOCK_FILE]);

      // Verify UserDocument linked
      expect(userDocumentService.createUserDocument).toHaveBeenCalledWith(
        USER_A,
        'doc-id-123',
        'test.pdf'
      );

      // Verify Hash uses doc ID
      const forContentMock = generationHashService.forContent as jest.Mock;
      expect(forContentMock).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        expect.arrayContaining(['doc-id-123'])
      );
    });

    it('should use selected files for hashing', async () => {
      // Setup
      cacheService.get.mockResolvedValue(null);
      prismaService.content.findFirst.mockResolvedValue(null);
      prismaService.content.create.mockResolvedValue({
        id: 'content-selected',
      });
      queue.add.mockResolvedValue({ id: 'job-selected' });

      // Mock UserDocument fetch
      const userDocumentService = (contentService as any).userDocumentService;
      userDocumentService.getUserDocumentById.mockResolvedValue({
        id: 'ud-existing',
        displayName: 'existing.pdf',
        document: {
          id: 'doc-existing-id',
          cloudinaryUrl: 'url',
          sizeBytes: 100,
        },
      });

      await contentService.generate(USER_A, {
        selectedFileIds: ['ud-existing'],
      });

      // Verify Hash uses existing doc ID
      const forContentMock = generationHashService.forContent as jest.Mock;
      expect(forContentMock).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        expect.arrayContaining(['doc-existing-id'])
      );
    });
  });
});
