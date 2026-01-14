import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { QuotaFeature, QuotaService } from '../services/quota.service';
import { CacheService } from '../services/cache.service';
import { StudyPackService } from '../../study-pack/study-pack.service';
import { JobContext, JobStrategy } from './interfaces/job-strategy.interface';

/**
 * BaseProcessor provides a standardized lifecycle for background jobs.
 * It uses the Strategy Pattern to delegate job-specific logic.
 */
export abstract class BaseProcessor<
  TData = any,
  TResult = any,
> extends WorkerHost {
  protected abstract readonly logger: Logger;

  constructor(
    protected readonly eventEmitter: EventEmitter2,
    protected readonly quotaService: QuotaService,
    protected readonly cacheService: CacheService,
    protected readonly studyPackService: StudyPackService,
    protected readonly strategy: JobStrategy<TData, TResult>
  ) {
    super();
  }

  /**
   * Main process method called by BullMQ.
   * Standardizes the job lifecycle: pre-process -> execute -> post-process -> cleanup -> notification.
   */
  async process(job: Job<TData>): Promise<any> {
    const jobId = job.id?.toString() || 'unknown';
    const userId = (job.data as any).userId;

    this.logger.log(`[Job ${jobId}] Starting process for user ${userId}`);

    let context: JobContext<TData>;

    try {
      // 1. Pre-process (Validation, File prep, etc.)
      await job.updateProgress(10);
      context = await this.strategy.preProcess(job);
      context.jobId = jobId;
      context.userId = userId;

      // 2. Execute (Core logic, e.g., AI generation)
      await job.updateProgress(30);
      const result = await this.strategy.execute(context);

      // 3. Post-process (Save to DB, Link content)
      await job.updateProgress(70);
      const finalRecord = await this.strategy.postProcess(context, result);

      // 4. Quota management
      const quotaType = this.strategy.getQuotaType(context) as QuotaFeature;
      if (quotaType) {
        await this.quotaService.incrementQuota(userId, quotaType);
      }

      // 5. Cache invalidation
      const cachePatterns = this.strategy.getCachePatterns(context);
      const invalidationPromises = cachePatterns.map((pattern) =>
        this.cacheService.invalidateByPattern(pattern)
      );

      await Promise.all([
        ...invalidationPromises,
        this.studyPackService.invalidateUserCache(userId),
      ]);

      // 6. Notifications & Events
      const eventNames = this.strategy.getEventNames();
      if (eventNames.completed) {
        this.eventEmitter.emit(
          eventNames.completed,
          this.strategy.getEventData(context, finalRecord)
        );
      }

      await job.updateProgress(100);
      this.logger.log(`[Job ${jobId}] Successfully completed`);

      return {
        success: true,
        id: finalRecord?.id,
      };
    } catch (error) {
      this.logger.error(`[Job ${jobId}] Failed: ${error.message}`, error.stack);

      // Emit failure event if context exists
      const eventNames = this.strategy.getEventNames();
      if (eventNames.failed) {
        // Create basic context if preProcess failed
        const failContext = context || {
          userId,
          jobId,
          data: job.data,
          startTime: Date.now(),
        };
        this.eventEmitter.emit(
          eventNames.failed,
          this.strategy.getFailureData(failContext, error)
        );
      }

      throw error;
    }
  }
}
