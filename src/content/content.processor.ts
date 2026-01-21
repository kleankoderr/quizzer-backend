import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { EventFactory, EVENTS } from '../events/events.types';
import { UserDocumentService } from '../user-document/user-document.service';
import { QuotaService } from '../common/services/quota.service';
import { SubscriptionHelperService } from '../common/services/subscription-helper.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { LearningGuideSchema } from '../langchain/schemas/learning-guide.schema';
import { LangChainPrompts } from '../langchain/prompts';

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

@Processor('content-generation')
export class ContentProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userDocumentService: UserDocumentService,
    private readonly quotaService: QuotaService,
    private readonly subscriptionHelper: SubscriptionHelperService,
    private readonly studyPackService: StudyPackService,
    @InjectQueue('summary-generation')
    private readonly summaryQueue: Queue
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

      await job.updateProgress(20);

      // Create UserDocument references for uploaded files
      if (files && files.length > 0) {
        await this.createUserDocumentReferences(userId, files, jobId);
      }

      this.logger.log(
        `Job ${jobId}: Generating content for topic: "${dto.topic || 'from files/text'}"`
      );
      await job.updateProgress(30);

      const prompt = await LangChainPrompts.learningGuideGeneration.format({
        topic: dto.topic || 'General Knowledge',
        sourceContentSection: LangChainPrompts.formatSourceContent(dto.content),
        fileContextSection: LangChainPrompts.formatFileContext(
          fileReferences.length > 0 ? 'See attached files for context.' : ''
        ),
      });

      const result = await this.langchainService.invokeWithStructure(
        LearningGuideSchema,
        prompt,
        {
          task: 'study-material',
          hasFiles: fileReferences.length > 0,
        }
      );

      // Extract generated data from the unified response
      const { title, topic, description, learningGuide } = result;

      await job.updateProgress(80);

      const content = await this.prisma.content.create({
        data: {
          title: title?.trim() || dto.title || 'Untitled Study Guide',
          topic: topic?.trim() || dto.topic || 'General',
          description: description?.trim(),
          learningGuide: learningGuide as any,
          userId,
          content: '',
          studyPackId: dto.studyPackId,
        },
      });

      await this.quotaService.incrementQuota(userId, 'studyMaterial');

      await this.studyPackService.invalidateUserCache(userId).catch(() => {});

      // Auto-generate summary for premium users
      await this.queueSummaryForPremiumUser(userId, content.id, jobId);

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

  /**
   * Queue summary generation for premium users
   */
  private async queueSummaryForPremiumUser(
    userId: string,
    studyMaterialId: string,
    jobId: string
  ): Promise<void> {
    try {
      // Check if user is premium using subscription (single source of truth)
      const isPremium = await this.subscriptionHelper.isPremiumUser(userId);

      if (isPremium) {
        await this.summaryQueue.add(
          'generate-summary',
          { studyMaterialId, userId },
          {
            priority: 2, // Medium priority
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          }
        );
        this.logger.log(
          `Job ${jobId}: Queued summary generation for premium user (Content ID: ${studyMaterialId})`
        );
      } else {
        this.logger.debug(
          `Job ${jobId}: User is not premium, skipping summary generation`
        );
      }
    } catch (error) {
      // Log error but don't fail content creation
      this.logger.warn(
        `Job ${jobId}: Failed to queue summary generation: ${error.message}`
      );
    }
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
