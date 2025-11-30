import { Test, TestingModule } from "@nestjs/testing";
import { QuizService } from "./quiz.service";
import { PrismaService } from "../prisma/prisma.service";
import { RecommendationService } from "../recommendation/recommendation.service";
import { StreakService } from "../streak/streak.service";
import { ChallengeService } from "../challenge/challenge.service";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { FILE_STORAGE_SERVICE } from "../file-storage/interfaces/file-storage.interface";
import { getQueueToken } from "@nestjs/bullmq";

describe("QuizService Deletion", () => {
  let service: QuizService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    quiz: {
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
        QuizService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RecommendationService, useValue: {} },
        { provide: StreakService, useValue: {} },
        { provide: ChallengeService, useValue: {} },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: FILE_STORAGE_SERVICE, useValue: mockFileStorageService },
        { provide: getQueueToken("quiz-generation"), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe("deleteQuiz", () => {
    it("should dereference content when deleting quiz", async () => {
      const userId = "user-1";
      const quizId = "quiz-1";
      const contentId = "content-1";

      mockPrismaService.quiz.findFirst.mockResolvedValue({
        id: quizId,
        userId,
        contentId,
        sourceFiles: [],
      });

      await service.deleteQuiz(quizId, userId);

      expect(prismaService.content.update).toHaveBeenCalledWith({
        where: { id: contentId },
        data: { quizId: null },
      });
      expect(prismaService.quiz.delete).toHaveBeenCalledWith({
        where: { id: quizId },
      });
    });
  });
});
