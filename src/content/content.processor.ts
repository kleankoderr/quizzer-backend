import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { EventFactory, EVENTS } from '../events/events.types';
import { QuotaService } from '../common/services/quota.service';
import { SubscriptionHelperService } from '../common/services/subscription-helper.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { LangChainPrompts } from '../langchain/prompts';
import { InputPipeline } from '../input-pipeline/input-pipeline.service';

export interface ContentJobData {
  userId: string;
  dto: {
    title?: string;
    topic?: string;
    content?: string;
    studyPackId?: string;
  };
  files?: Array<{
    originalname: string;
    cloudinaryUrl?: string;
    cloudinaryId?: string;
    googleFileUrl?: string;
    googleFileId?: string;
    documentId?: string;
    mimetype?: string;
    size?: number;
  }>;
}

@Injectable()
@Processor('content-generation')
export class ContentProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly eventEmitter: EventEmitter2,
    private readonly inputPipeline: InputPipeline,
    private readonly quotaService: QuotaService,
    private readonly subscriptionHelper: SubscriptionHelperService,
    private readonly studyPackService: StudyPackService
  ) {
    super();
  }

  async process(job: Job<ContentJobData>): Promise<any> {
    const { userId, dto, files } = job.data;
    const jobId = job.id;
    this.logger.log(
      `Processing content generation job ${jobId} for user ${userId}`
    );

    try {
      await job.updateProgress(10);

      // Use input pipeline to process all input sources
      const inputSources = await this.inputPipeline.process({
        ...dto,
        files,
        userId,
      });

      this.logger.log(
        `Job ${jobId}: Processing ${inputSources.length} input source(s)`
      );

      await job.updateProgress(20);

      // Combine sources with precedence: FILE > CONTENT > TITLE
      const contentForAI = this.inputPipeline.combineInputSources(inputSources);

      this.logger.log(`Job ${jobId}: Generating study material`);
      await job.updateProgress(30);

      const prompt = LangChainPrompts.generateComprehensiveLearningGuide(
        dto.topic || '',
        contentForAI || ''
      );

      const result = await this.langchainService.invokeWithJsonParser(prompt, {
        task: 'study-material',
        userId,
        jobId,
      });

      // Extract generated data from the unified response
      const { title, topic, description, learningGuide } = result;

      await job.updateProgress(80);

      const content = await this.prisma.content.create({
        data: {
          title: title?.trim() || dto.title || dto.topic || 'Untitled',
          topic: topic?.trim() || dto.topic || 'General',
          description: description?.trim(),
          learningGuide: learningGuide,
          content: '',
          user: {
            connect: {
              id: userId,
            },
          },
          ...(dto.studyPackId && {
            studyPack: {
              connect: {
                id: dto.studyPackId,
              },
            },
          }),
        },
      });

      await this.quotaService.incrementQuota(userId, 'studyMaterial');

      await this.studyPackService.invalidateUserCache(userId).catch(() => {});

      await job.updateProgress(100);
      this.logger.log(
        `Job ${jobId}: Successfully completed (Content ID: ${content.id})`
      );

      this.eventEmitter.emit(
        EVENTS.CONTENT.COMPLETED,
        EventFactory.contentCompleted(userId, jobId, content.id, {
          title: content.title,
          topic: content.topic,
        })
      );

      return {
        success: true,
        id: content.id,
      };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Failed to generate content`,
        error.stack
      );
      this.eventEmitter.emit(
        EVENTS.CONTENT.FAILED,
        EventFactory.contentFailed(userId, jobId, error.message)
      );
      throw new Error('Failed to generate study material.');
    }
  }
}
