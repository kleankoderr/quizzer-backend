import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EventFactory, EVENTS } from '../events/events.types';
import { UserDocumentService } from '../user-document/user-document.service';

export interface ContentJobData {
  userId: string;
  dto: {
    title?: string;
    topic?: string;
    content?: string;
  };
  files?: Array<{
    originalname: string;
    cloudinaryUrl?: string;
    cloudinaryId?: string;
    googleFileUrl?: string;
    googleFileId?: string;
    documentId?: string;
  }>;
}

@Processor('content-generation')
export class ContentProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userDocumentService: UserDocumentService
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
      this.emitProgress(userId, jobId, 'Starting content generation...', 10);
      await job.updateProgress(10);

      // Validate input - at least one of topic, content, or files must be provided
      if (!dto.topic && !dto.content && (!files || files.length === 0)) {
        throw new Error(
          'At least one of topic, content, or files must be provided'
        );
      }

      const fileReferences =
        files?.map((file) => ({
          googleFileUrl: file.googleFileUrl,
          googleFileId: file.googleFileId,
          originalname: file.originalname,
        })) || [];

      this.logger.debug(
        `Job ${jobId}: Using ${fileReferences.length} pre-uploaded file(s)`
      );

      if (fileReferences.length > 0) {
        this.emitProgress(
          userId,
          jobId,
          `Processing ${fileReferences.length} file(s)...`,
          20
        );
      }

      await job.updateProgress(20);

      // Create UserDocument references for uploaded files
      if (files && files.length > 0) {
        await this.createUserDocumentReferences(userId, files, jobId);
      }

      this.logger.log(
        `Job ${jobId}: Generating content for topic: "${dto.topic || 'from files/text'}"`
      );
      this.emitProgress(
        userId,
        jobId,
        `Analyzing content and preparing sections...`,
        30
      );
      await job.updateProgress(30);

      let sections: string;
      let topic: string;
      let title: string;

      if (fileReferences.length > 0) {
        // Generate from files (uploaded or selected)
        this.emitProgress(
          userId,
          jobId,
          `Generating study material from files...`,
          60
        );
        await job.updateProgress(60);

        const contentResponse =
          await this.aiService.generateContentFromFiles(fileReferences);

        // Convert sections to markdown text
        sections = this.convertSectionsToMarkdown(contentResponse.sections);

        title = contentResponse.title;

        this.logger.debug(
          `Job ${jobId}: Generated ${sections.length} chars from ${fileReferences.length} file(s)`
        );

        this.logger.debug(`Job ${jobId}: Title: "${title}", Topic: "${topic || ''}"`);
      } else if (dto.topic || dto.content) {
        // Generate from topic or content
        this.emitProgress(userId, jobId, `Generating study material ...`, 60);
        await job.updateProgress(60);

        const contentResponse = await this.aiService.generateContentFromTopic(
          topic || '',
          dto.content
        );

        // Convert sections to markdown text
        sections = this.convertSectionsToMarkdown(contentResponse.sections);

        // Use provided generated title or dto title
        title = contentResponse.title || dto.title;
        topic = dto.topic;
      }

      this.emitProgress(userId, jobId, 'Finalizing and saving...', 80);
      await job.updateProgress(80);

      const content = await this.prisma.content.create({
        data: {
          title: title?.trim() || '',
          content: sections,
          topic: topic?.trim() || '',
          userId,
        },
      });

      this.emitProgress(userId, jobId, 'Generating learning guide...', 85);
      await job.updateProgress(85);

      try {
        const learningGuide = await this.aiService.generateLearningGuide({
          topic,
          content: content.content.substring(0, 10000),
        });

        await this.prisma.content.update({
          where: { id: content.id },
          data: { learningGuide },
        });
      } catch (_error) {
        this.logger.warn(
          `Failed to generate learning guide: ${_error.message}`
        );
      }

      await job.updateProgress(100);
      this.logger.log(
        `Job ${jobId}: Successfully completed (Content ID: ${content.id})`
      );

      this.eventEmitter.emit(
        EVENTS.CONTENT.COMPLETED,
        EventFactory.contentCompleted(userId, content.id, {
          title: content.title,
          topic: content.topic,
        })
      );

      return {
        success: true,
        content,
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
      throw error;
    }
  }

  private emitProgress(
    userId: string,
    jobId: string,
    step: string,
    percentage: number
  ) {
    this.eventEmitter.emit(
      EVENTS.CONTENT.PROGRESS,
      EventFactory.contentProgress(userId, jobId, step, percentage)
    );
  }

  /**
   * Create UserDocument references for uploaded files
   */
  private async createUserDocumentReferences(
    userId: string,
    files: Array<{
      originalname: string;
      cloudinaryUrl?: string;
      googleFileUrl?: string;
      documentId?: string;
    }>,
    jobId: string
  ): Promise<void> {
    try {
      for (const file of files) {
        if (file.documentId) {
          await this.userDocumentService.createUserDocument(
            userId,
            file.documentId,
            file.originalname
          );
          this.logger.debug(
            `Job ${jobId}: Created UserDocument reference for ${file.originalname}`
          );
        }
      }
    } catch (error) {
      // Log warning but don't fail the job
      this.logger.warn(
        `Job ${jobId}: Failed to create UserDocument references: ${error.message}`
      );
    }
  }

  /**
   * Convert content sections to markdown text
   */
  private convertSectionsToMarkdown(
    sections: Array<{ title: string; content: string }>
  ): string {
    return sections
      .map((section) => {
        return `## ${section.title}\n\n${section.content}`;
      })
      .join('\n\n');
  }
}
