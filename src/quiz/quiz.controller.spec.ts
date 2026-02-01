import { Test, TestingModule } from '@nestjs/testing';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { BadRequestException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { GenerateQuizDto } from './dto/quiz.dto';

import { QuotaService } from '../common/services/quota.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuotaGuard } from '../common/guards/quota.guard';

describe('QuizController', () => {
  let controller: QuizController;
  let service: DeepMockProxy<QuizService>;

  const USER_ID = 'user-123';
  const QUIZ_ID = 'quiz-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuizController],
      providers: [
        {
          provide: QuizService,
          useValue: mockDeep<QuizService>(),
        },
        {
          provide: QuotaService,
          useValue: mockDeep<QuotaService>(),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(QuotaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QuizController>(QuizController);
    service = module.get(QuizService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateQuiz', () => {
    it('should throw BadRequest if no input provided', async () => {
      const dto = {} as GenerateQuizDto;
      await expect(controller.generateQuiz(USER_ID, dto, [])).rejects.toThrow(
        BadRequestException
      );
    });

    it('should call service with valid input', async () => {
      const dto: any = { topic: 'Math', difficulty: 'medium' };
      service.generateQuiz.mockResolvedValue({
        jobId: 'job-1',
        status: 'pending',
        cached: false,
      } as any);

      const result = await controller.generateQuiz(USER_ID, dto, []);

      expect(service.generateQuiz).toHaveBeenCalledWith(USER_ID, dto, []);
      expect(result).toEqual({
        jobId: 'job-1',
        status: 'pending',
        cached: false,
      });
    });
  });

  describe('getQuizById', () => {
    it('should return quiz details', async () => {
      service.getQuizById.mockResolvedValue({
        id: QUIZ_ID,
        title: 'Math Quiz',
      });

      const result = await controller.getQuizById(QUIZ_ID, USER_ID);

      expect(service.getQuizById).toHaveBeenCalledWith(QUIZ_ID, USER_ID);
      expect(result).toEqual({ id: QUIZ_ID, title: 'Math Quiz' });
    });
  });

  describe('submitQuiz', () => {
    it('should submit answers', async () => {
      const dto = { answers: ['A'], challengeId: undefined };
      service.submitQuiz.mockResolvedValue({ score: 10 } as any);

      const result = await controller.submitQuiz(QUIZ_ID, USER_ID, dto);

      expect(service.submitQuiz).toHaveBeenCalledWith(USER_ID, QUIZ_ID, dto);
      expect(result).toEqual({ score: 10 });
    });
  });

  describe('deleteQuiz', () => {
    it('should delete quiz', async () => {
      service.deleteQuiz.mockResolvedValue({
        success: true,
        message: 'Deleted',
      });

      const result = await controller.deleteQuiz(QUIZ_ID, USER_ID);

      expect(service.deleteQuiz).toHaveBeenCalledWith(QUIZ_ID, USER_ID);
      expect(result).toEqual({ success: true, message: 'Deleted' });
    });
  });
});
