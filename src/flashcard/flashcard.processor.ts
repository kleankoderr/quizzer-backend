import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from '../events/events.constants';
import { EventFactory } from '../events/events.types';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { CacheService } from '../common/services/cache.service';
import { GenerateFlashcardDto } from './dto/flashcard.dto';
import { UserDocumentService } from '../user-document/user-document.service';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';

export interface ProcessedFileData {
  originalname: string;
  cloudinaryUrl?: string;
  cloudinaryId?: string;
  googleFileUrl?: string;
  googleFileId?: string;
  mimetype?: string;
  documentId?: string;
}

export interface FlashcardJobData {
  userId: string;
  dto: GenerateFlashcardDto;
  files?: ProcessedFileData[];
}

@Processor('flashcard-generation')
export class FlashcardProcessor extends WorkerHost {
  private readonly logger = new Logger(FlashcardProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
    private readonly userDocumentService: UserDocumentService,
    private readonly quotaService: QuotaService,
    private readonly studyPackService: StudyPackService
  ) {
    super();
  }

  async process(job: Job<FlashcardJobData>): Promise<any> {
    const { userId, dto, files } = job.data;
    const jobId = job.id?.toString() || 'unknown'; // Ensure jobId is string
    this.logger.log(
      `Processing flashcard generation job ${jobId} for user ${userId}`
    );

    try {
      await job.updateProgress(10);

      // Prepare file references for AI service
      // Files are already uploaded to Google, just pass the URLs/IDs
      const fileReferences =
        files?.map((file) => ({
          googleFileUrl: file.googleFileUrl,
          googleFileId: file.googleFileId,
          originalname: file.originalname,
          mimetype: file.mimetype,
        })) || [];

      this.logger.debug(
        `Job ${jobId}: Using ${fileReferences.length} pre-uploaded file(s)`
      );

      await job.updateProgress(20);

      // Create UserDocument references for uploaded files
      if (files && files.length > 0) {
        await this.createUserDocumentReferences(userId, files, jobId);
      }

      // Generate flashcards using AI with Google File API references
      this.logger.log(
        `Job ${jobId}: Generating flashcards with topic: "${dto.topic || 'N/A'}"`
      );

      const { cards, title, topic } = await this.aiService.generateFlashcards({
        topic: dto.topic,
        content: dto.content,
        fileReferences, // Pass file references instead of buffers
        numberOfCards: dto.numberOfCards,
      });

      this.logger.log(`Job ${jobId}: Generated ${cards.length} flashcard(s)`);
      await job.updateProgress(70);

      // Determine source type for analytics
      const sourceType = this.determineSourceType(dto, files);

      // Extract Google File URLs for storage
      const googleFileUrls =
        files?.map((f) => f.googleFileUrl).filter(Boolean) || [];

      await job.updateProgress(85);

      // Save flashcard set to database
      this.logger.debug(`Job ${jobId}: Persisting flashcard set`);
      const flashcardSet = await this.prisma.flashcardSet.create({
        data: {
          title,
          topic: (topic || dto.topic).trim(),
          cards: cards as any,
          userId,
          contentId: dto.contentId,
          sourceType,
          sourceFiles: googleFileUrls.length > 0 ? googleFileUrls : undefined,
          studyPackId: dto.studyPackId,
        },
      });

      // Link flashcard set to content if applicable
      if (dto.contentId) {
        await this.prisma.content.update({
          where: { id: dto.contentId },
          data: { flashcardSetId: flashcardSet.id },
        });
        this.logger.debug(`Job ${jobId}: Linked to content ${dto.contentId}`);
      }

      await this.quotaService.incrementQuota(userId, 'flashcard');

      await Promise.all([
        this.studyPackService.invalidateUserCache(userId),
        this.cacheService.invalidateByPattern(`flashcards:all:${userId}*`),
        this.cacheService.invalidateByPattern(`flashcard:*:${userId}`),
      ]);

      await job.updateProgress(100);
      this.logger.log(
        `Job ${jobId}: Successfully completed (Set ID: ${flashcardSet.id})`
      );

      this.eventEmitter.emit(
        EVENTS.FLASHCARD.COMPLETED,
        EventFactory.flashcardCompleted(
          userId,
          jobId,
          flashcardSet.id,
          cards.length,
          {
            title: flashcardSet.title,
          }
        )
      );

      return {
        success: true,
        id: flashcardSet.id,
      };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Failed to generate flashcards`,
        error.stack
      );
      this.eventEmitter.emit(
        EVENTS.FLASHCARD.FAILED,
        EventFactory.flashcardFailed(userId, jobId, error.message)
      );
      throw error;
    }
  }

  /**
   * Determine the primary source type for the flashcard set
   */
  private determineSourceType(
    dto: GenerateFlashcardDto,
    files?: ProcessedFileData[]
  ): string {
    if (files && files.length > 0) return 'file';
    if (dto.content) return 'text';
    return 'topic';
  }

  /**
   * Create UserDocument references for uploaded files
   */
  private async createUserDocumentReferences(
    userId: string,
    files: ProcessedFileData[],
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
