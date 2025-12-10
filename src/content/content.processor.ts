import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EventFactory, EVENTS } from '../events/events.types';

export interface ContentJobData {
  userId: string;
  dto: {
    topic?: string;
    content?: string;
  };
  files?: Array<{
    originalname: string;
    cloudinaryUrl?: string;
    cloudinaryId?: string;
    googleFileUrl?: string;
    googleFileId?: string;
  }>;
}

@Processor('content-generation')
export class ContentProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2
  ) {
    super();
  }

  async process(job: Job<ContentJobData>): Promise<any> {
    const { userId, dto, files } = job.data;
    const jobId = job.id?.toString() || 'unknown';
    this.logger.log(
      `Processing content generation job ${jobId} for user ${userId}`
    );

    try {
      this.emitProgress(userId, jobId, 'Starting content generation...', 10);
      await job.updateProgress(10);

      const userExists = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userExists) {
        throw new Error(`User with ID ${userId} not found`);
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

      this.logger.log(
        `Job ${jobId}: Generating content for topic: "${dto.topic || 'from files/text'}"`
      );
      this.emitProgress(
        userId,
        jobId,
        `Creating study material.. This might take a moment.`,
        40
      );

      let generatedText: string;
      let topic: string;
      let title: string;

      if (fileReferences.length > 0) {
        generatedText =
          await this.aiService.generateContentFromFiles(fileReferences);

        this.logger.debug(
          `Job ${jobId}: Generated ${generatedText.length} chars from ${fileReferences.length} file(s)`
        );

        [title, topic] = await Promise.all([
          this.aiService.extractTitle(generatedText),
          this.aiService.extractTopic(generatedText),
        ]);

        this.logger.debug(
          `Job ${jobId}: Extracted title: "${title}", topic: "${topic}"`
        );
      } else if (dto.topic) {
        topic = dto.topic;
        generatedText = await this.aiService.generateContentFromTopic(
          topic,
          dto.content
        );
        title = `${topic} - Study Material`;
      } else if (dto.content) {
        generatedText = await this.aiService.generateContentFromTopic(
          'Study Material',
          dto.content
        );

        [title, topic] = await Promise.all([
          this.aiService.extractTitle(generatedText),
          this.aiService.extractTopic(generatedText),
        ]);
      } else {
        throw new Error(
          'At least one of topic, content, or files must be provided'
        );
      }

      this.emitProgress(userId, jobId, 'Finalizing and saving...', 70);
      await job.updateProgress(70);

      const content = await this.prisma.content.create({
        data: {
          title: title.trim(),
          content: generatedText,
          topic: topic.trim(),
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
}
