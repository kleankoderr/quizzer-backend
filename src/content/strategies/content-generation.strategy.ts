import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
    private readonly inputPipeline: InputPipeline,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('section-generation') private readonly sectionQueue: Queue
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
      this.logger.log(
        `Job ${context.jobId}: Generating learning guide outline`
      );

      // Generate OUTLINE ONLY (fast - 3-5 seconds)
      const prompt = LangChainPrompts.generateLearningGuideOutline(
        dto.topic || '',
        contentForAI || ''
      );

      const result = await this.langchainService.invokeWithJsonParser(prompt, {
        task: 'learning-guide-outline',
        userId: context.userId,
        jobId: context.jobId,
      });

      const latency = Date.now() - startTime;
      this.logger.log(
        `Job ${context.jobId}: Outline generation completed in ${latency}ms with ${result.sections?.length || 0} sections`
      );

      // Extract outline data
      const { title, topic, description, sections } = result;

      return { title, topic, description, sections };
    } catch (error) {
      this.logger.error(
        `Job ${context.jobId}: Outline generation failed: ${error.message}`
      );

      throw new Error(
        error.message?.includes('timeout') ||
          error.message?.includes('timed out')
          ? 'Learning guide outline generation timed out. Please try with a shorter topic or less content.'
          : 'Failed to generate learning guide outline. Please try again.'
      );
    }
  }

  async postProcess(context: ContentContext, result: any): Promise<any> {
    const { userId, data } = context;
    const { dto } = data;
    const { contentForAI } = context;
    const { title, topic, description, sections } = result;

    // Create content with sections structure, including pre-generated first section content
    const content = await this.prisma.content.create({
      data: {
        title: title?.trim() || dto.title || dto.topic || 'Untitled',
        topic: topic?.trim() || dto.topic || 'General',
        description: description?.trim(),
        learningGuide: {
          sections: sections.map((s: any, index: number) => ({
            title: s.title,
            content: index === 0 ? s.content || '' : '',
            example: index === 0 ? s.example || '' : '',
            knowledgeCheck: index === 0 ? s.knowledgeCheck || null : null,
          })),
        },
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

    if (sections[0]?.content) {
      this.logger.log(
        `Job ${context.jobId}: First section "${sections[0].title}" was pre-generated with the outline.`
      );
    }

    this.logger.log(
      `Job ${context.jobId}: Created content ${content.id} with ${sections.length} empty sections`
    );

    // Emit outline completed event
    this.eventEmitter.emit(
      EVENTS.LEARNING_GUIDE.OUTLINE_COMPLETED,
      EventFactory.learningGuideOutlineCompleted(userId, content.id, sections)
    );

    // Queue section generation job
    await this.sectionQueue.add('generate-sections', {
      contentId: content.id,
      userId,
      topic: topic || dto.topic || '',
      sections,
      sourceContent: contentForAI,
    });

    this.logger.log(
      `Job ${context.jobId}: Queued section generation for ${sections.length} sections`
    );

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
