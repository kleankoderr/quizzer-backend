import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { SummaryService } from '../summary.service';
import { LangChainPrompts } from '../../langchain/prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { SummaryJobData } from '../summary.processor';
import { JobContext, JobStrategy } from '../../common/queue/interfaces/job-strategy.interface';

export interface SummaryContext extends JobContext<SummaryJobData> {
  content: any;
  existingSummaryId?: string;
  existingShortCode?: string;
}

@Injectable()
export class SummaryGenerationStrategy implements JobStrategy<
  SummaryJobData,
  any,
  SummaryContext
> {
  private readonly logger = new Logger(SummaryGenerationStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly summaryService: SummaryService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async preProcess(job: Job<SummaryJobData>): Promise<SummaryContext> {
    const { studyMaterialId, userId } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    const content = await this.prisma.content.findUnique({
      where: { id: studyMaterialId },
      select: {
        id: true,
        title: true,
        topic: true,
        content: true,
        learningGuide: true,
        userId: true,
      },
    });

    if (!content) {
      throw new Error('Study material not found');
    }

    if (content.userId !== userId) {
      throw new Error('Unauthorized: User does not own this study material');
    }

    // Check if summary already exists
    const existingSummary = await this.prisma.summary.findUnique({
      where: { studyMaterialId },
    });

    if (existingSummary) {
      this.logger.warn(
        `Job ${jobId}: Summary already exists for content ${studyMaterialId}`
      );
      return {
        userId,
        jobId,
        data: job.data,
        startTime: Date.now(),
        content,
        existingSummaryId: existingSummary.id,
        existingShortCode: existingSummary.shortCode,
      };
    }

    return {
      userId,
      jobId,
      data: job.data,
      startTime: Date.now(),
      content,
    };
  }

  async execute(context: SummaryContext): Promise<any> {
    if (context.existingSummaryId) {
      return {
        id: context.existingSummaryId,
        shortCode: context.existingShortCode,
        alreadyExists: true,
      };
    }

    const { content, jobId } = context;

    this.logger.log(
      `Job ${jobId}: Generating AI summary for "${content.title}"`
    );

    const prompt = LangChainPrompts.generateSummary(
      content.title,
      content.topic,
      content.content || 'Not provided',
      content.learningGuide || null
    );

    try {
      let summaryText = '';
      const stream = this.langchainService.stream(prompt, {
        userId: context.userId,
        task: 'summary',
      });

      // Add timeout for streaming
      const startTime = Date.now();
      const STREAM_TIMEOUT_MS = 300_000; // 5 minutes

      for await (const chunk of stream) {
        // Check timeout
        if (Date.now() - startTime > STREAM_TIMEOUT_MS) {
          throw new Error('Summary generation timed out');
        }

        summaryText += chunk;

        // Emit chunk event for real-time progress
        this.eventEmitter.emit(
          EVENTS.SUMMARY.CHUNK,
          EventFactory.summaryChunk(context.userId, jobId, chunk)
        );
      }

      const shortCode = await this.summaryService.generateShortCode();

      return {
        summaryText,
        shortCode,
      };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Summary generation failed: ${error.message}`
      );

      throw new Error(
        error.message?.includes('timeout') ||
          error.message?.includes('timed out')
          ? 'Summary generation timed out. Please try with shorter content.'
          : 'Failed to generate summary. Please try again.'
      );
    }
  }

  async postProcess(context: SummaryContext, result: any): Promise<any> {
    if (result.alreadyExists) {
      return { id: result.id, shortCode: result.shortCode };
    }

    const { studyMaterialId } = context.data;
    const { summaryText, shortCode } = result;

    const summary = await this.prisma.summary.create({
      data: {
        studyMaterialId,
        content: summaryText,
        shortCode,
        isPublic: true,
        viewCount: 0,
        failedAttempts: 0,
      },
    });

    return summary;
  }

  getEventData(context: SummaryContext, result: any): any {
    return EventFactory.summaryCompleted(
      context.userId,
      context.jobId,
      result.id,
      {
        shortCode: result.shortCode,
        contentTitle: context.content.title,
      }
    );
  }

  getFailureData(context: SummaryContext, error: Error): any {
    // Custom logic to increment failed attempts
    this.incrementFailedAttempts(context.data.studyMaterialId);

    return EventFactory.summaryFailed(
      context.userId,
      context.data.studyMaterialId,
      error.message
    );
  }

  getCachePatterns(_context: SummaryContext): string[] {
    return [];
  }

  getQuotaType(_context: SummaryContext): string {
    return 'summary';
  }

  getEventNames() {
    return {
      completed: EVENTS.SUMMARY.COMPLETED,
      failed: EVENTS.SUMMARY.FAILED,
    };
  }

  private async incrementFailedAttempts(studyMaterialId: string) {
    try {
      await this.prisma.summary.updateMany({
        where: { studyMaterialId },
        data: {
          failedAttempts: {
            increment: 1,
          },
        },
      });
    } catch (updateError) {
      this.logger.warn(
        `Failed to update failedAttempts counter: ${updateError.message}`
      );
    }
  }
}
