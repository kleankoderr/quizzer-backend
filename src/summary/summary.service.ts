import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { customAlphabet } from 'nanoid';
import { UserPlan } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  8
);

const SHORT_CODE_CACHE_KEY = 'summary:shortcodes:pool';
const SHORT_CODE_POOL_SIZE = 5;
const SHORT_CODE_REFILL_THRESHOLD = 0.8; // 80%
const SHORT_CODE_CACHE_TTL = 86400; // 24 hours
const SUMMARY_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  private generatingCodes = false; // Lock for thread safety

  constructor(
    @InjectQueue('summary-generation')
    private readonly summaryQueue: Queue,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  /**
   * Queue summary generation job
   * Validates user has PREMIUM plan and content doesn't already have a summary
   */
  async queueSummaryGeneration(
    studyMaterialId: string,
    userId: string
  ): Promise<{ jobId: string }> {
    // Check user plan is PREMIUM
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.plan !== UserPlan.PREMIUM) {
      throw new ForbiddenException(
        'Summary generation is only available for premium users'
      );
    }

    // Verify the study material exists and belongs to the user
    const content = await this.prisma.content.findFirst({
      where: {
        id: studyMaterialId,
        userId,
      },
    });

    if (!content) {
      throw new NotFoundException('Study material not found');
    }

    // Check if summary already exists
    const existingSummary = await this.prisma.summary.findUnique({
      where: { studyMaterialId },
    });

    if (existingSummary) {
      throw new BadRequestException('Summary already exists for this content');
    }

    // Add job to queue with medium priority
    const job = await this.summaryQueue.add(
      'generate-summary',
      {
        studyMaterialId,
        userId,
      },
      {
        priority: 2, // Medium priority
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );

    this.logger.log(
      `Queued summary generation for content ${studyMaterialId}, job ID: ${job.id}`
    );

    return { jobId: job.id };
  }

  /**
   * Get the status of a summary generation job
   */
  async getJobStatus(jobId: string, userId: string) {
    const job = await this.summaryQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.data.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view this job'
      );
    }

    const state = await job.getState();
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      id: job.id,
      state,
      progress: job.progress,
      result,
      failedReason,
    };
  }

  /**
   * Generate a unique short code with advanced caching strategy
   * Pre-generates a pool of 5 codes, refills when 80% consumed
   * Thread-safe with lock mechanism
   */
  async generateShortCode(): Promise<string> {
    // Get cached short code pool
    let codePool = await this.cacheManager.get<string[]>(SHORT_CODE_CACHE_KEY);

    // If cache is empty, generate initial pool
    if (!codePool || codePool.length === 0) {
      this.logger.log('Short code pool empty, generating initial pool');
      codePool = await this.generateShortCodePool(SHORT_CODE_POOL_SIZE);
      await this.cacheManager.set(
        SHORT_CODE_CACHE_KEY,
        codePool,
        SHORT_CODE_CACHE_TTL * 1000
      );
    }

    // Pop a code from the pool
    const shortCode = codePool.shift();

    if (!shortCode) {
      throw new Error('Failed to retrieve short code from pool');
    }

    // Update cache with remaining codes
    await this.cacheManager.set(
      SHORT_CODE_CACHE_KEY,
      codePool,
      SHORT_CODE_CACHE_TTL * 1000
    );

    // Check if we need to refill (80% threshold)
    const usagePercentage = 1 - codePool.length / SHORT_CODE_POOL_SIZE;

    if (
      usagePercentage >= SHORT_CODE_REFILL_THRESHOLD &&
      !this.generatingCodes
    ) {
      this.logger.log(
        `Short code pool at ${Math.round(usagePercentage * 100)}% usage, triggering refill`
      );
      // Refill asynchronously without blocking
      this.refillShortCodePool().catch((error) => {
        this.logger.error('Failed to refill short code pool:', error);
      });
    }

    return shortCode;
  }

  /**
   * Generate a pool of unique short codes
   * Checks against both cache and database for uniqueness
   */
  private async generateShortCodePool(size: number): Promise<string[]> {
    const codes: string[] = [];
    const maxAttempts = size * 3; // Allow retries
    let attempts = 0;

    // Get existing codes from cache if available
    const cachedCodes =
      (await this.cacheManager.get<string[]>(SHORT_CODE_CACHE_KEY)) || [];

    while (codes.length < size && attempts < maxAttempts) {
      const code = nanoid();
      attempts++;

      // Check if code is already in cache pool
      if (cachedCodes.includes(code)) {
        this.logger.debug(`Code collision in cache: ${code}`);
        continue;
      }

      // Check if code is already in new codes array
      if (codes.includes(code)) {
        continue;
      }

      // Check database for uniqueness
      const existing = await this.prisma.summary.findUnique({
        where: { shortCode: code },
      });

      if (existing) {
        this.logger.warn(`Code collision in database: ${code}`);
      } else {
        codes.push(code);
      }
    }

    if (codes.length < size) {
      this.logger.warn(
        `Generated ${codes.length}/${size} codes after ${attempts} attempts`
      );
    }

    return codes;
  }

  /**
   * Refill short code pool asynchronously
   * Thread-safe with lock mechanism
   */
  private async refillShortCodePool(): Promise<void> {
    // Check lock
    if (this.generatingCodes) {
      this.logger.debug('Short code generation already in progress, skipping');
      return;
    }

    try {
      this.generatingCodes = true;

      // Get current pool
      const currentPool =
        (await this.cacheManager.get<string[]>(SHORT_CODE_CACHE_KEY)) || [];

      // Calculate how many codes to generate
      const codesToGenerate = SHORT_CODE_POOL_SIZE - currentPool.length;

      if (codesToGenerate <= 0) {
        this.logger.debug('Pool already full, skipping refill');
        return;
      }

      this.logger.log(`Refilling pool with ${codesToGenerate} new codes`);

      // Generate new codes
      const newCodes = await this.generateShortCodePool(codesToGenerate);

      // Merge with existing pool
      const updatedPool = [...currentPool, ...newCodes];

      // Update cache
      await this.cacheManager.set(
        SHORT_CODE_CACHE_KEY,
        updatedPool,
        SHORT_CODE_CACHE_TTL * 1000
      );

      this.logger.log(
        `Successfully refilled pool. Total codes: ${updatedPool.length}`
      );
    } finally {
      this.generatingCodes = false;
    }
  }

  /**
   * Find summary by short code with related data
   * Includes studyMaterial relation and aggregated reaction counts
   * Cached for performance
   */
  async findByShortCode(shortCode: string, userId?: string) {
    // Check cache first if it's a public request
    // Note: We bypass cache for private checks or ownership verification to ensure fresh data
    const cacheKey = `summary:${shortCode}`;

    if (!userId) {
      const cached = await this.cacheManager.get<any>(cacheKey);
      if (cached?.isPublic) {
        this.logger.debug(`Cache hit for public summary: ${shortCode}`);
        return cached;
      }
    }

    const summary = await this.prisma.summary.findUnique({
      where: { shortCode },
      include: {
        studyMaterial: {
          select: {
            id: true,
            title: true,
            topic: true,
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        reactions: {
          select: {
            id: true,
            type: true,
            userId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    // Privacy Check
    if (!summary.isPublic) {
      // If user is not logged in OR logged in user is not the owner
      if (!userId || summary.studyMaterial.userId !== userId) {
        // Return 404 to hide existence of private resource
        throw new NotFoundException('Summary not found');
      }
    }

    // Aggregate reaction counts by type
    const reactionCounts = summary.reactions.reduce(
      (acc, reaction) => {
        acc[reaction.type] = (acc[reaction.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const result = {
      ...summary,
      reactionCounts,
    };

    // Cache the result
    await this.cacheManager.set(cacheKey, result, SUMMARY_CACHE_TTL * 1000);

    return result;
  }

  /**
   * Toggle summary visibility (public/private)
   * Uses userId from @CurrentUser decorator - ownership already verified
   */
  async toggleVisibility(
    summaryId: string,
    userId: string,
    isPublic: boolean
  ): Promise<void> {
    // Find summary with study material
    const summary = await this.prisma.summary.findUnique({
      where: { id: summaryId },
      include: {
        studyMaterial: {
          select: { userId: true },
        },
      },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    // Verify ownership
    if (summary.studyMaterial.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this summary'
      );
    }

    // Update visibility
    await this.prisma.summary.update({
      where: { id: summaryId },
      data: { isPublic },
    });

    // Invalidate cache
    const summaryWithCode = await this.prisma.summary.findUnique({
      where: { id: summaryId },
      select: { shortCode: true },
    });

    if (summaryWithCode) {
      await this.invalidateSummaryCache(summaryWithCode.shortCode);
    }

    this.logger.log(
      `Summary ${summaryId} visibility updated to ${isPublic ? 'public' : 'private'}`
    );
  }

  /**
   * Increment view count atomically
   * Also invalidates cache
   */
  async incrementViewCount(
    shortCode: string,
    ip: string,
    userId?: string
  ): Promise<void> {
    const summary = await this.prisma.summary.findUnique({
      where: { shortCode },
      select: { id: true },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    // Check for existing view
    let hasViewed = false;

    if (userId) {
      // Check if user has viewed
      const existingView = await this.prisma.summaryView.findFirst({
        where: {
          summaryId: summary.id,
          userId,
        },
      });
      hasViewed = !!existingView;
    } else {
      // Check if IP has viewed (for guests)
      const existingView = await this.prisma.summaryView.findFirst({
        where: {
          summaryId: summary.id,
          ip,
          userId: null, // Only check views where user was NOT logged in
        },
      });
      hasViewed = !!existingView;
    }

    if (!hasViewed) {
      // Create view record
      await this.prisma.summaryView.create({
        data: {
          summaryId: summary.id,
          userId: userId || null,
          ip,
        },
      });

      // Increment aggregate count
      await this.prisma.summary.update({
        where: { shortCode },
        data: {
          viewCount: {
            increment: 1,
          },
        },
      });

      // Invalidate cache to reflect new view count
      await this.invalidateSummaryCache(shortCode);
    }
  }

  /**
   * Add or remove a reaction (toggle behavior)
   * Invalidates cache after change
   */
  async addReaction(
    shortCode: string,
    userId: string,
    type: string
  ): Promise<{ action: 'added' | 'removed' }> {
    // Find summary by shortCode
    const summary = await this.prisma.summary.findUnique({
      where: { shortCode },
      select: { id: true },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    // Check if reaction already exists
    const existingReaction = await this.prisma.summaryReaction.findUnique({
      where: {
        summaryId_userId_type: {
          summaryId: summary.id,
          userId,
          type,
        },
      },
    });

    let action: 'added' | 'removed';

    if (existingReaction) {
      // Remove reaction (toggle off)
      await this.prisma.summaryReaction.delete({
        where: { id: existingReaction.id },
      });

      this.logger.log(
        `Removed ${type} reaction from summary ${shortCode} by user ${userId}`
      );

      action = 'removed';
    } else {
      // Add reaction (toggle on)
      await this.prisma.summaryReaction.create({
        data: {
          summaryId: summary.id,
          userId,
          type,
        },
      });

      this.logger.log(
        `Added ${type} reaction to summary ${shortCode} by user ${userId}`
      );

      action = 'added';
    }

    // Invalidate cache to reflect new reactions
    await this.invalidateSummaryCache(shortCode);

    return { action };
  }

  /**
   * Delete summary
   * Reactions cascade delete automatically via schema
   * Uses userId from @CurrentUser decorator - ownership already verified
   */
  async deleteSummary(summaryId: string, userId: string): Promise<void> {
    // Find summary
    const summary = await this.prisma.summary.findUnique({
      where: { id: summaryId },
      include: {
        studyMaterial: {
          select: { userId: true },
        },
      },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    // Verify ownership
    if (summary.studyMaterial.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this summary'
      );
    }

    // Delete summary (reactions cascade)
    await this.prisma.summary.delete({
      where: { id: summaryId },
    });

    // Invalidate cache
    await this.invalidateSummaryCache(summary.shortCode);

    this.logger.log(`Summary ${summaryId} deleted by user ${userId}`);
  }

  /**
   * List all summaries for a user
   */
  async listUserSummaries(userId: string) {
    return this.prisma.summary.findMany({
      where: {
        studyMaterial: {
          userId,
        },
      },
      include: {
        studyMaterial: {
          select: {
            id: true,
            title: true,
            topic: true,
          },
        },
        _count: {
          select: {
            reactions: true,
          },
        },
      },
      orderBy: {
        generatedAt: 'desc',
      },
    });
  }

  /**
   * Invalidate summary cache
   */
  private async invalidateSummaryCache(shortCode: string): Promise<void> {
    const cacheKey = `summary:${shortCode}`;
    await this.cacheManager.del(cacheKey);
    this.logger.debug(`Invalidated cache for summary: ${shortCode}`);
  }
}
