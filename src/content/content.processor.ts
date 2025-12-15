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
    studyPackId?: string;
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
      }

      await job.updateProgress(20);

      // Create UserDocument references for uploaded files
      if (files && files.length > 0) {
        await this.createUserDocumentReferences(userId, files, jobId);
      }

      this.logger.log(
        `Job ${jobId}: Generating content for topic: "${dto.topic || 'from files/text'}"`
      );
      await job.updateProgress(30);

      // Use the unified single-call generation strategy
      await job.updateProgress(60);

      const result = await this.aiService.generateLearningGuideFromInputs(
        dto.topic,
        dto.content,
        fileReferences
      );

      // Extract generated data from the unified response
      const { title, topic, description, learningGuide } = result;

      await job.updateProgress(80);

      const content = await this.prisma.content.create({
        data: {
          title: title?.trim() || dto.title || 'Untitled Study Guide',
          topic: topic?.trim() || dto.topic || 'General',
          description: description?.trim(),
          learningGuide,
          userId,
          content: '',
          studyPackId: dto.studyPackId,
        },
      });

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
}
