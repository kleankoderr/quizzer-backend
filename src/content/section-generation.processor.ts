import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/services/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { LangChainPrompts } from '../langchain/prompts';
import { EventFactory, EVENTS } from '../events/events.types';
import { ConcurrencyManager } from '../common/utils/concurrency.utils';
import { BufferResourceType, DatabaseBufferService } from '../common/services/database-buffer.service';

export interface SectionJobData {
  contentId: string;
  userId: string;
  topic: string;
  sections: Array<{ title: string; keywords?: string[] }>;
  sourceContent: string;
  contentHash?: string;
}

@Injectable()
@Processor('section-generation')
export class SectionGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(SectionGenerationProcessor.name);
  private readonly concurrencyLimit: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly buffer: DatabaseBufferService,
    private readonly cacheService: CacheService
  ) {
    super();

    // Load concurrency configuration
    this.concurrencyLimit = this.configService.get<number>(
      'aiConcurrency.sections',
      3
    );
    this.retryAttempts = this.configService.get<number>(
      'aiConcurrency.retryAttempts',
      2
    );
    this.retryDelayMs = this.configService.get<number>(
      'aiConcurrency.retryDelayMs',
      2000
    );
  }

  async process(job: Job<SectionJobData>): Promise<any> {
    const { contentId, userId, topic, sections, sourceContent, contentHash } =
      job.data;
    const jobId = job.id?.toString() || 'unknown';

    this.logger.log(
      `Job ${jobId}: Starting PARALLEL section generation for content ${contentId} - ${sections.length} sections (max ${this.concurrencyLimit} concurrent)`
    );

    try {
      const startTime = Date.now();

      // Execute sections in parallel with concurrency limit
      const result = await ConcurrencyManager.executeBatch(
        sections,
        async (section, index) => {
          await this.generateSection(
            contentId,
            userId,
            index,
            section,
            topic,
            sourceContent
          );
          return index; // Return index to track completion
        },
        {
          maxConcurrent: this.concurrencyLimit,
          retryAttempts: this.retryAttempts,
          retryDelayMs: this.retryDelayMs,
        }
      );

      await this.buffer.flush(BufferResourceType.LEARNING_GUIDE, contentId);

      const duration = Date.now() - startTime;

      // Log results
      this.logger.log(
        `Job ${jobId}: Completed parallel section generation in ${duration}ms - ${result.successful.length} successful, ${result.failed.length} failed`
      );

      // Cleanup collateral list and pending-job key if all sections done successfully
      if (contentHash && result.failed.length === 0) {
        await this.cacheService.invalidate(
          `pending-job:content:${contentHash}`
        );
      }

      // Handle failed sections
      if (result.failed.length > 0) {
        this.logger.warn(
          `Job ${jobId}: ${result.failed.length} sections failed to generate.`
        );
      }

      return {
        success: result.failed.length === 0,
        completedCount: result.successful.length,
        failedCount: result.failed.length,
      };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Section generation process failed: ${error.message}`
      );
      throw error;
    }
  }

  private async generateSection(
    contentId: string,
    userId: string,
    sectionIndex: number,
    section: { title: string; keywords?: string[] },
    topic: string,
    sourceContent: string
  ): Promise<void> {
    const { title, keywords = [] } = section;

    this.logger.log(
      `Content ${contentId}: Starting section ${sectionIndex + 1} - "${title}"`
    );

    // Emit section started event
    this.eventEmitter.emit(
      EVENTS.LEARNING_GUIDE.SECTION_STARTED,
      EventFactory.learningGuideSectionStarted(
        userId,
        contentId,
        sectionIndex,
        title
      )
    );

    try {
      // Check if section already has content (e.g., pre-generated first section)
      const content = await this.prisma.content.findUnique({
        where: { id: contentId },
        select: { learningGuide: true },
      });

      const learningGuide = content?.learningGuide as any;
      const existingSection = learningGuide?.sections?.[sectionIndex];

      if (existingSection?.content && existingSection.content.length > 0) {
        this.logger.log(
          `Content ${contentId}: Section ${sectionIndex + 1} ("${title}") already has content. Skipping generation.`
        );

        // Emit section completed event to keep UI/UX consistent
        this.eventEmitter.emit(
          EVENTS.LEARNING_GUIDE.SECTION_COMPLETED,
          EventFactory.learningGuideSectionCompleted(
            userId,
            contentId,
            sectionIndex
          )
        );
        return;
      }

      // Generate section content prompt
      const prompt = LangChainPrompts.generateSectionContent(
        title,
        keywords,
        topic,
        sourceContent
      );

      // Use invokeWithJsonParser for reliable JSON parsing
      // (streaming was causing incomplete/truncated responses)
      const parsed = await this.langchainService.invokeWithJsonParser(prompt, {
        task: 'section-generation',
        userId,
      });

      const sectionData = {
        content: parsed.content || '',
        example: parsed.example || '',
        knowledgeCheck: parsed.knowledgeCheck || null,
      };

      // Buffer the section in memory instead of direct DB update for main content
      await this.buffer.addSection(contentId, sectionIndex, sectionData);

      // Emit section completed event
      this.eventEmitter.emit(
        EVENTS.LEARNING_GUIDE.SECTION_COMPLETED,
        EventFactory.learningGuideSectionCompleted(
          userId,
          contentId,
          sectionIndex
        )
      );

      this.logger.log(
        `Content ${contentId}: Completed section ${sectionIndex + 1} - "${title}"`
      );
    } catch (error) {
      this.logger.error(
        `Content ${contentId}: Failed to generate section ${sectionIndex + 1}: ${error.message}`
      );
      throw error;
    }
  }
}
