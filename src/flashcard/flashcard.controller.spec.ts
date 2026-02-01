import { Test, TestingModule } from '@nestjs/testing';
import { FlashcardController } from './flashcard.controller';
import { FlashcardService } from './flashcard.service';
import { QuotaService } from '../common/services/quota.service';
import { CacheService } from '../common/services/cache.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuotaGuard } from '../common/guards/quota.guard';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('FlashcardController', () => {
  let controller: FlashcardController;
  let service: DeepMockProxy<FlashcardService>;
  let quotaService: DeepMockProxy<QuotaService>;

  const USER_ID = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlashcardController],
      providers: [
        { provide: FlashcardService, useValue: mockDeep<FlashcardService>() },
        { provide: QuotaService, useValue: mockDeep<QuotaService>() },
        { provide: CacheService, useValue: mockDeep<CacheService>() },
        { provide: ConfigService, useValue: mockDeep<ConfigService>() },
        { provide: Reflector, useValue: mockDeep<Reflector>() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { sub: USER_ID };
          return true;
        },
      })
      .overrideGuard(QuotaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(FlashcardController);
    service = module.get(FlashcardService);
    quotaService = module.get(QuotaService);
  });

  describe('generateFlashcards', () => {
    it('should call service with inputs', async () => {
      const dto = { topic: 'test', numberOfCards: 10 };
      const files: any[] = [];
      const expectedResult = { jobId: 'job-1', status: 'pending' };

      service.generateFlashcards.mockResolvedValue(expectedResult as any);

      const result = await controller.generateFlashcards(USER_ID, dto, files);

      expect(service.generateFlashcards).toHaveBeenCalledWith(
        USER_ID,
        dto,
        files
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getJobStatus', () => {
    it('should return status', async () => {
      const jobId = 'job-1';
      const status = { id: jobId, status: 'completed' };
      service.getJobStatus.mockResolvedValue(status as any);

      const result = await controller.getJobStatus(jobId, USER_ID);
      expect(result).toEqual(status);
      expect(service.getJobStatus).toHaveBeenCalledWith(jobId, USER_ID);
    });
  });

  describe('getAllFlashcardSets', () => {
    it('should return list of sets', async () => {
      const sets = { data: [], meta: { total: 0 } };
      service.getAllFlashcardSets.mockResolvedValue(sets as any);

      const result = await controller.getAllFlashcardSets(USER_ID, 1, 10);
      expect(result).toEqual(sets);
      expect(service.getAllFlashcardSets).toHaveBeenCalledWith(
        USER_ID,
        1,
        10,
        undefined
      );
    });
  });

  describe('getFlashcardSetById', () => {
    it('should return set', async () => {
      const set = { id: 'set-1' };
      service.getFlashcardSetById.mockResolvedValue(set as any);

      const result = await controller.getFlashcardSetById('set-1', USER_ID);
      expect(result).toEqual(set);
      expect(service.getFlashcardSetById).toHaveBeenCalledWith(
        'set-1',
        USER_ID
      );
    });
  });

  describe('deleteFlashcardSet', () => {
    it('should delete set', async () => {
      service.deleteFlashcardSet.mockResolvedValue({ success: true } as any);

      const result = await controller.deleteFlashcardSet('set-1', USER_ID);
      expect(result).toEqual({ success: true });
      expect(service.deleteFlashcardSet).toHaveBeenCalledWith('set-1', USER_ID);
    });
  });
});
