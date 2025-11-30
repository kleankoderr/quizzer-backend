import { Test, TestingModule } from "@nestjs/testing";
import { FlashcardService } from "./flashcard.service";
import { PrismaService } from "../prisma/prisma.service";
import { RecommendationService } from "../recommendation/recommendation.service";
import { StreakService } from "../streak/streak.service";
import { ChallengeService } from "../challenge/challenge.service";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { FILE_STORAGE_SERVICE } from "../file-storage/interfaces/file-storage.interface";
import { getQueueToken } from "@nestjs/bullmq";

describe("FlashcardService Deletion", () => {
  let service: FlashcardService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    flashcardSet: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    attempt: {
      deleteMany: jest.fn(),
    },
    content: {
      update: jest.fn(),
    },
  };

  const mockCacheManager = {
    del: jest.fn(),
  };

  const mockFileStorageService = {
    deleteFile: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RecommendationService, useValue: {} },
        { provide: StreakService, useValue: {} },
        { provide: ChallengeService, useValue: {} },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: FILE_STORAGE_SERVICE, useValue: mockFileStorageService },
        { provide: getQueueToken("flashcard-generation"), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FlashcardService>(FlashcardService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe("deleteFlashcardSet", () => {
    it("should dereference content when deleting flashcard set", async () => {
      const userId = "user-1";
      const flashcardSetId = "flashcard-1";
      const contentId = "content-1";

      mockPrismaService.flashcardSet.findFirst.mockResolvedValue({
        id: flashcardSetId,
        userId,
        contentId,
        sourceFiles: [],
      });

      await service.deleteFlashcardSet(flashcardSetId, userId);

      expect(prismaService.content.update).toHaveBeenCalledWith({
        where: { id: contentId },
        data: { flashcardSetId: null },
      });
      expect(prismaService.flashcardSet.delete).toHaveBeenCalledWith({
        where: { id: flashcardSetId },
      });
    });
  });
});
