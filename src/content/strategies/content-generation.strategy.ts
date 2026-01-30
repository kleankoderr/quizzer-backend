import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { LangChainPrompts } from '../../langchain/prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { ContentJobData } from '../content.processor';
import { JobContext, JobStrategy } from '../../common/queue/interfaces/job-strategy.interface';
import { InputPipeline } from '../../input-pipeline/input-pipeline.service';
import { InputSource } from '../../input-pipeline/input-source.interface';

export interface ContentContext extends JobContext<ContentJobData> {
  inputSources: InputSource[];
  contentForAI: string;
}

@Injectable()
export class ContentGenerationStrategy implements JobStrategy<
  ContentJobData,
  any,
  ContentContext
> {
  private readonly logger = new Logger(ContentGenerationStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly inputPipeline: InputPipeline
  ) {}

  async preProcess(job: Job<ContentJobData>): Promise<ContentContext> {
    const { userId, dto, files } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    // Use input pipeline to process all input sources
    const inputSources = await this.inputPipeline.process({
      ...dto,
      files,
      userId,
    });

    this.logger.log(
      `Job ${jobId}: Processing ${inputSources.length} input source(s)`
    );

    // Combine sources with precedence: FILE > CONTENT > TITLE
    const contentForAI = this.inputPipeline.combineInputSources(inputSources);

    return {
      userId,
      jobId,
      data: job.data,
      startTime: Date.now(),
      inputSources,
      contentForAI,
    };
  }

  async execute(context: ContentContext): Promise<any> {
    const { dto } = context.data;
    const { contentForAI } = context;

    try {
      const startTime = Date.now();
      this.logger.log(`Job ${context.jobId}: Generating study material`);

      const prompt = LangChainPrompts.generateComprehensiveLearningGuide(
        dto.topic || '',
        contentForAI || ''
      );

      const result = await this.langchainService.invokeWithJsonParser(prompt, {
        task: 'study-material',
        userId: context.userId,
        jobId: context.jobId,
      });

      const latency = Date.now() - startTime;
      this.logger.log(
        `Job ${context.jobId}: Study material generation completed in ${latency}ms`
      );

      // Extract generated data from the unified response
      const { title, topic, description, learningGuide } = result;

      return { title, topic, description, learningGuide };
    } catch (error) {
      this.logger.error(
        `Job ${context.jobId}: Study material generation failed: ${error.message}`
      );

      throw new Error(
        error.message?.includes('timeout') ||
          error.message?.includes('timed out')
          ? 'Study material generation timed out. Please try with a shorter topic or less content.'
          : 'Failed to generate study material. Please try again.'
      );
    }
  }

  async postProcess(context: ContentContext, result: any): Promise<any> {
    const { userId, data } = context;
    const { dto } = data;
    const { title, topic, description, learningGuide } = result;

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

    return content;
  }

  getEventData(context: ContentContext, result: any): any {
    return EventFactory.contentCompleted(
      context.userId,
      context.jobId,
      result.id,
      {
        title: result.title,
        topic: result.topic,
      }
    );
  }

  getFailureData(context: ContentContext, error: Error): any {
    return EventFactory.contentFailed(
      context.userId,
      context.jobId,
      error.message
    );
  }

  getCachePatterns(_context: ContentContext): string[] {
    // No specific cache patterns for content
    // BaseProcessor will handle study pack cache invalidation
    return [];
  }

  getQuotaType(_context: ContentContext): string {
    return 'studyMaterial';
  }

  getEventNames() {
    return {
      completed: EVENTS.CONTENT.COMPLETED,
      failed: EVENTS.CONTENT.FAILED,
    };
  }
}
