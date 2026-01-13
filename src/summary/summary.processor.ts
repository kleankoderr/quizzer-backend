import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { SummaryService } from './summary.service';
import { EventFactory, EVENTS } from '../events/events.types';

export interface SummaryJobData {
  studyMaterialId: string;
  userId: string;
}

@Processor('summary-generation')
export class SummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(SummaryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly summaryService: SummaryService,
    private readonly eventEmitter: EventEmitter2
  ) {
    super();
  }

  async process(job: Job<SummaryJobData>): Promise<any> {
    const { studyMaterialId, userId } = job.data;
    const jobId = job.id;

    this.logger.log(
      `Processing summary generation job ${jobId} for content ${studyMaterialId}`
    );

    try {
      // Step 1: Fetch the study material (10% progress)
      await job.updateProgress(10);

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
          success: true,
          id: existingSummary.id,
          shortCode: existingSummary.shortCode,
          alreadyExists: true,
        };
      }

      this.logger.log(
        `Job ${jobId}: Generating AI summary for "${content.title}"`
      );

      // Step 2: Generate summary content using AI (50% progress)
      const summaryText = await this.aiService.generateStudyMaterialSummary(
        content.learningGuide as any,
        content.title,
        content.topic
      );

      await job.updateProgress(50);

      // Generate unique short code from pre-generated pool
      const shortCode = await this.summaryService.generateShortCode();

      // Step 3: Create summary in database (100% progress)
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

      await job.updateProgress(100);

      this.logger.log(
        `Job ${jobId}: Successfully created summary ${summary.id} with code ${shortCode}`
      );

      // Emit success event
      this.eventEmitter.emit(
        EVENTS.SUMMARY.COMPLETED,
        EventFactory.summaryCompleted(userId, jobId, summary.id, {
          shortCode: summary.shortCode,
          contentTitle: content.title,
        })
      );

      return {
        success: true,
        id: summary.id,
        shortCode: summary.shortCode,
      };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Failed to generate summary for content ${studyMaterialId}`,
        error.stack
      );

      // Increment failed attempts counter
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
          `Job ${jobId}: Failed to update failedAttempts counter`,
          updateError.message
        );
      }

      // Emit failure event
      this.eventEmitter.emit(
        EVENTS.SUMMARY.FAILED,
        EventFactory.summaryFailed(userId, studyMaterialId, error.message)
      );

      throw error;
    }
  }
}
