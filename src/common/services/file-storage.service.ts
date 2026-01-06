import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementEngine } from '../../subscription/domain/services/entitlement-engine.service';
import { UsageService } from '../../subscription/domain/services/usage.service';
import { EntitlementKeys } from '../../subscription/constants/entitlement-keys';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementEngine: EntitlementEngine,
    private readonly usageService: UsageService
  ) {}

  /**
   * Check if file storage limit allows upload
   * @param userId User ID
   * @param fileSizeMB File size in MB
   * @returns Upload permission details
   */
  async checkFileStorageLimit(
    userId: string,
    fileSizeMB: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    current: number;
    limit: number;
  }> {
    // Check file storage entitlement
    const result = await this.entitlementEngine.authorize(
      userId,
      EntitlementKeys.FILE_STORAGE
    );

    if (!result.allowed) {
      throw new ForbiddenException(result.reason);
    }

    const limit = result.metadata?.limit || 0;
    const current = result.metadata?.used || 0;

    // Strict enforcement for downgraded users
    if (current > limit) {
      throw new ForbiddenException(
        `Your storage limit has been reduced. Please delete ${(current - limit).toFixed(2)}MB of files before uploading new ones.`
      );
    }

    const newTotal = current + fileSizeMB;

    if (newTotal > limit) {
      throw new ForbiddenException(
        `File storage limit exceeded (${current.toFixed(2)}MB/${limit}MB). ${
          result.metadata?.remaining === 0
            ? 'Your storage is full. Please delete some files.'
            : 'Upgrade to premium for more storage.'
        }`
      );
    }

    return {
      allowed: true,
      remaining: limit - newTotal,
      current,
      limit,
    };
  }

  /**
   * Check if user is within storage limits
   * @param userId User ID
   * @returns True if usage is within limit
   */
  async enforceStorageLimit(userId: string): Promise<boolean> {
    const result = await this.entitlementEngine.authorize(
      userId,
      EntitlementKeys.FILE_STORAGE
    );

    if (!result.allowed) {
      return false;
    }

    const limit = result.metadata?.limit || 0;
    const current = result.metadata?.used || 0;

    return current <= limit;
  }

  /**
   * Get suggestions for files to delete to get back under storage limit
   * @param userId User ID
   */
  async getStorageCleanupSuggestions(userId: string) {
    const result = await this.entitlementEngine.authorize(
      userId,
      EntitlementKeys.FILE_STORAGE
    );

    const limit = result.metadata?.limit || 0;
    const current = result.metadata?.used || 0;

    if (current <= limit) {
      return { needsCleanup: false };
    }

    const needToDelete = current - limit;

    // Get user's largest files
    const largestFiles = await this.prisma.userDocument.findMany({
      where: { userId },
      include: { document: true },
      orderBy: { document: { sizeBytes: 'desc' } },
      take: 10,
    });

    return {
      needsCleanup: true,
      neededDeletion: needToDelete,
      currentUsage: current,
      limit,
      suggestions: largestFiles.map((uf) => ({
        id: uf.id,
        name: uf.displayName,
        sizeMB: (uf.document.sizeBytes / 1024 / 1024).toFixed(2),
        uploadedAt: uf.uploadedAt,
      })),
    };
  }

  /**
   * Increment file upload counters after successful upload
   * @param userId User ID
   * @param fileSizeMB File size in MB
   */
  async incrementFileUpload(userId: string, fileSizeMB: number): Promise<void> {
    // Increment file upload count
    await this.usageService.incrementUsage(
      userId,
      EntitlementKeys.FILE_UPLOAD,
      1
    );

    // Increment storage usage
    await this.usageService.incrementUsage(
      userId,
      EntitlementKeys.FILE_STORAGE,
      fileSizeMB
    );

    this.logger.log(
      `Incremented file upload for user ${userId}: +${fileSizeMB}MB`
    );
  }
}
