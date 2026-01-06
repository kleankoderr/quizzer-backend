import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('UsageService', () => {
  let service: UsageService;

  const mockPrismaService = {
    usageRecord: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsageService>(UsageService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUsage', () => {
    it('should return current usage value when record exists', async () => {
      const mockRecord = {
        id: 'record-1',
        userId: 'user-1',
        featureKey: 'quiz',
        currentValue: 5,
        resetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.usageRecord.findUnique.mockResolvedValue(mockRecord);

      const result = await service.getUsage('user-1', 'quiz');

      expect(result).toBe(5);
      expect(mockPrismaService.usageRecord.findUnique).toHaveBeenCalledWith({
        where: { userId_featureKey: { userId: 'user-1', featureKey: 'quiz' } },
      });
    });

    it('should return 0 when no record exists', async () => {
      mockPrismaService.usageRecord.findUnique.mockResolvedValue(null);

      const result = await service.getUsage('user-1', 'quiz');

      expect(result).toBe(0);
    });

    it('should track different features independently', async () => {
      mockPrismaService.usageRecord.findUnique
        .mockResolvedValueOnce({ currentValue: 5 }) // quiz
        .mockResolvedValueOnce({ currentValue: 3 }); // flashcard

      const quizUsage = await service.getUsage('user-1', 'quiz');
      const flashcardUsage = await service.getUsage('user-1', 'flashcard');

      expect(quizUsage).toBe(5);
      expect(flashcardUsage).toBe(3);
    });
  });

  describe('incrementUsage', () => {
    it('should create new record when none exists', async () => {
      const mockDate = new Date('2026-02-01T00:00:00Z');
      const mockRecord = {
        id: 'record-1',
        userId: 'user-1',
        featureKey: 'quiz',
        currentValue: 1,
        resetAt: mockDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.usageRecord.upsert.mockResolvedValue(mockRecord);

      const result = await service.incrementUsage('user-1', 'quiz');

      expect(result).toBe(1);
      expect(mockPrismaService.usageRecord.upsert).toHaveBeenCalledWith({
        where: { userId_featureKey: { userId: 'user-1', featureKey: 'quiz' } },
        create: {
          userId: 'user-1',
          featureKey: 'quiz',
          currentValue: 1,
          resetAt: expect.any(Date),
        },
        update: {
          currentValue: { increment: 1 },
        },
      });
    });

    it('should increment existing record atomically', async () => {
      const mockRecord = {
        id: 'record-1',
        userId: 'user-1',
        featureKey: 'quiz',
        currentValue: 6, // After incrementing from 5
        resetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.usageRecord.upsert.mockResolvedValue(mockRecord);

      const result = await service.incrementUsage('user-1', 'quiz');

      expect(result).toBe(6);
      expect(mockPrismaService.usageRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            currentValue: { increment: 1 },
          },
        })
      );
    });

    it('should support custom increment amounts', async () => {
      const mockRecord = {
        currentValue: 15, // After incrementing by 10
        resetAt: new Date(),
      };

      mockPrismaService.usageRecord.upsert.mockResolvedValue(mockRecord);

      const result = await service.incrementUsage('user-1', 'quiz', 10);

      expect(result).toBe(15);
      expect(mockPrismaService.usageRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            currentValue: 10,
          }),
          update: {
            currentValue: { increment: 10 },
          },
        })
      );
    });

    it('should support fractional increments for storage tracking', async () => {
      const mockRecord = {
        currentValue: 25.5, // 25.5 MB
        resetAt: new Date(),
      };

      mockPrismaService.usageRecord.upsert.mockResolvedValue(mockRecord);

      const result = await service.incrementUsage(
        'user-1',
        'fileStorage',
        25.5
      );

      expect(result).toBe(25.5);
    });

    it('should track arbitrary feature keys without schema changes', async () => {
      const customFeatureKey = 'customFeature123';
      const mockRecord = {
        currentValue: 1,
        resetAt: new Date(),
      };

      mockPrismaService.usageRecord.upsert.mockResolvedValue(mockRecord);

      const result = await service.incrementUsage('user-1', customFeatureKey);

      expect(result).toBe(1);
      expect(mockPrismaService.usageRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_featureKey: {
              userId: 'user-1',
              featureKey: customFeatureKey,
            },
          },
        })
      );
    });
  });

  describe('decrementUsage', () => {
    it('should decrement usage atomically', async () => {
      const mockRecord = {
        id: 'record-1',
        userId: 'user-1',
        featureKey: 'fileStorage',
        currentValue: 75, // After decrementing from 100
        resetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.usageRecord.update.mockResolvedValue(mockRecord);

      const result = await service.decrementUsage('user-1', 'fileStorage', 25);

      expect(result).toBe(75);
      expect(mockPrismaService.usageRecord.update).toHaveBeenCalledWith({
        where: {
          userId_featureKey: { userId: 'user-1', featureKey: 'fileStorage' },
        },
        data: {
          currentValue: { decrement: 25 },
        },
      });
    });

    it('should support fractional decrements', async () => {
      const mockRecord = {
        currentValue: 50.25,
        resetAt: new Date(),
      };

      mockPrismaService.usageRecord.update.mockResolvedValue(mockRecord);

      const result = await service.decrementUsage(
        'user-1',
        'fileStorage',
        10.5
      );

      expect(result).toBe(50.25);
      expect(mockPrismaService.usageRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            currentValue: { decrement: 10.5 },
          },
        })
      );
    });
  });

  describe('resetUsage', () => {
    it('should reset usage to 0 and update resetAt', async () => {
      const mockRecord = {
        id: 'record-1',
        userId: 'user-1',
        featureKey: 'quiz',
        currentValue: 0,
        resetAt: expect.any(Date),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.usageRecord.update.mockResolvedValue(mockRecord);

      await service.resetUsage('user-1', 'quiz');

      expect(mockPrismaService.usageRecord.update).toHaveBeenCalledWith({
        where: { userId_featureKey: { userId: 'user-1', featureKey: 'quiz' } },
        data: {
          currentValue: 0,
          resetAt: expect.any(Date),
        },
      });
    });

    it('should calculate next monthly reset date correctly', async () => {
      const currentDate = new Date('2026-01-15T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(currentDate);

      mockPrismaService.usageRecord.update.mockResolvedValue({});

      await service.resetUsage('user-1', 'quiz');

      const expectedResetDate = new Date('2026-02-15T10:00:00Z');

      expect(mockPrismaService.usageRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resetAt: expectedResetDate,
          }),
        })
      );

      jest.useRealTimers();
    });
  });

  describe('Generic Usage Tracking - Acceptance Criteria', () => {
    it('should track any arbitrary feature key without database schema changes', async () => {
      const arbitraryKeys = [
        'newFeature2026',
        'experimentalAI',
        'betaAnalytics',
        'customTool',
      ];

      mockPrismaService.usageRecord.upsert.mockResolvedValue({
        currentValue: 1,
        resetAt: new Date(),
      });

      for (const key of arbitraryKeys) {
        await service.incrementUsage('user-1', key);
      }

      // Verify each key was tracked
      expect(mockPrismaService.usageRecord.upsert).toHaveBeenCalledTimes(4);

      arbitraryKeys.forEach((key, index) => {
        expect(mockPrismaService.usageRecord.upsert).toHaveBeenNthCalledWith(
          index + 1,
          expect.objectContaining({
            where: {
              userId_featureKey: { userId: 'user-1', featureKey: key },
            },
          })
        );
      });
    });

    it('should maintain separate counters for each user-feature combination', async () => {
      mockPrismaService.usageRecord.upsert.mockResolvedValue({
        currentValue: 1,
        resetAt: new Date(),
      });

      // Track same feature for different users
      await service.incrementUsage('user-1', 'quiz');
      await service.incrementUsage('user-2', 'quiz');

      // Track different features for same user
      await service.incrementUsage('user-1', 'flashcard');

      expect(mockPrismaService.usageRecord.upsert).toHaveBeenCalledTimes(3);

      // Verify unique composite keys
      expect(mockPrismaService.usageRecord.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            userId_featureKey: { userId: 'user-1', featureKey: 'quiz' },
          },
        })
      );

      expect(mockPrismaService.usageRecord.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            userId_featureKey: { userId: 'user-2', featureKey: 'quiz' },
          },
        })
      );

      expect(mockPrismaService.usageRecord.upsert).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          where: {
            userId_featureKey: { userId: 'user-1', featureKey: 'flashcard' },
          },
        })
      );
    });
  });
});
