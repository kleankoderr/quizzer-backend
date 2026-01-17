import { Test, TestingModule } from '@nestjs/testing';
import { QuotaService } from './quota.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionHelperService } from './subscription-helper.service';
import { ForbiddenException } from '@nestjs/common';

describe('QuotaService', () => {
  let service: QuotaService;

  const mockPrismaService = {
    userQuota: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscriptionPlan: {
      findFirst: jest.fn(),
    },
    userDocument: {
      findMany: jest.fn(),
    },
  };

  const mockSubscriptionHelper = {
    isPremiumUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: SubscriptionHelperService,
          useValue: mockSubscriptionHelper,
        },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkFileStorageLimit', () => {
    it('should allow upload if within existing free tier limit', async () => {
      const userId = 'user-1';
      const currentUsage = 10;
      const fileSize = 5;
      const limit = 50;

      mockPrismaService.userQuota.findUnique.mockResolvedValue({
        totalFileStorageMB: currentUsage,
      });

      mockPrismaService.subscription.findUnique.mockResolvedValue(null); // No subscription
      mockPrismaService.subscriptionPlan.findFirst.mockResolvedValue({
        quotas: { storageLimitMB: limit },
      });

      const result = await service.checkFileStorageLimit(userId, fileSize);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - (currentUsage + fileSize));
    });

    it('should block upload if user is already over limit (downgrade scenario)', async () => {
      const userId = 'user-1';
      const currentUsage = 100; // Over 50MB limit
      const fileSize = 1;
      const limit = 50;

      mockPrismaService.userQuota.findUnique.mockResolvedValue({
        totalFileStorageMB: currentUsage,
      });

      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findFirst.mockResolvedValue({
        quotas: { storageLimitMB: limit },
      });

      await expect(
        service.checkFileStorageLimit(userId, fileSize)
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.checkFileStorageLimit(userId, fileSize)
      ).rejects.toThrow(/limit has been reduced/);
    });
  });

  describe('getStorageCleanupSuggestions', () => {
    it('should return suggestions if over limit', async () => {
      const userId = 'user-1';
      const currentUsage = 100;
      const limit = 50;

      mockPrismaService.userQuota.findUnique.mockResolvedValue({
        totalFileStorageMB: currentUsage,
      });
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findFirst.mockResolvedValue({
        quotas: { storageLimitMB: limit },
      });

      mockPrismaService.userDocument.findMany.mockResolvedValue([
        {
          id: 'doc1',
          displayName: 'Big File',
          document: { sizeBytes: 20 * 1024 * 1024 },
          uploadedAt: new Date(),
        },
      ]);

      const result = await service.getStorageCleanupSuggestions(userId);

      expect(result.needsCleanup).toBe(true);
      expect(result.neededDeletion).toBe(currentUsage - limit);
      expect(result.suggestions).toHaveLength(1);
    });

    it('should return no cleanup needed if under limit', async () => {
      const userId = 'user-1';
      const currentUsage = 10;
      const limit = 50;

      mockPrismaService.userQuota.findUnique.mockResolvedValue({
        totalFileStorageMB: currentUsage,
      });
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findFirst.mockResolvedValue({
        quotas: { storageLimitMB: limit },
      });

      const result = await service.getStorageCleanupSuggestions(userId);

      expect(result.needsCleanup).toBe(false);
    });
  });
});
