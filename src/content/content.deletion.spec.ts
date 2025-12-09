import { Test, TestingModule } from '@nestjs/testing';
import { ContentService } from './content.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuizService } from '../quiz/quiz.service';
import { FlashcardService } from '../flashcard/flashcard.service';
import { AiService } from '../ai/ai.service';
import { TaskService } from '../task/task.service';
import { NotificationService } from '../notification/notification.service';
import { NotFoundException } from '@nestjs/common';

describe('ContentService Deletion', () => {
  let service: ContentService;
  let prismaService: PrismaService;
  let quizService: QuizService;
  let flashcardService: FlashcardService;

  const mockPrismaService = {
    content: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockQuizService = {
    deleteQuiz: jest.fn(),
  };

  const mockFlashcardService = {
    deleteFlashcardSet: jest.fn(),
  };

  const mockAiService = {};
  const mockTaskService = {};
  const mockNotificationService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: QuizService, useValue: mockQuizService },
        { provide: FlashcardService, useValue: mockFlashcardService },
        { provide: AiService, useValue: mockAiService },
        { provide: TaskService, useValue: mockTaskService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
    prismaService = module.get<PrismaService>(PrismaService);
    quizService = module.get<QuizService>(QuizService);
    flashcardService = module.get<FlashcardService>(FlashcardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deleteContent', () => {
    it('should delete content and associated quiz/flashcards', async () => {
      const userId = 'user-1';
      const contentId = 'content-1';
      const quizId = 'quiz-1';
      const flashcardSetId = 'flashcard-1';

      mockPrismaService.content.findUnique.mockResolvedValue({
        id: contentId,
        userId,
        quizId,
        flashcardSetId,
      });

      mockPrismaService.content.delete.mockResolvedValue({ id: contentId });

      await service.deleteContent(userId, contentId);

      expect(quizService.deleteQuiz).toHaveBeenCalledWith(quizId, userId);
      expect(flashcardService.deleteFlashcardSet).toHaveBeenCalledWith(
        flashcardSetId,
        userId
      );
      expect(prismaService.content.delete).toHaveBeenCalledWith({
        where: { id: contentId },
      });
    });

    it('should throw NotFoundException if content not found', async () => {
      mockPrismaService.content.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteContent('user-1', 'content-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if user does not own content', async () => {
      mockPrismaService.content.findUnique.mockResolvedValue({
        id: 'content-1',
        userId: 'other-user',
      });

      await expect(
        service.deleteContent('user-1', 'content-1')
      ).rejects.toThrow(NotFoundException);
    });
  });
});
