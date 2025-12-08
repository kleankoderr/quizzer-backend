import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, Inject } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { EVENTS } from "../events/events.constants";
import { EventFactory } from "../events/events.types";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { GenerateFlashcardDto } from "./dto/flashcard.dto";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";

export interface ProcessedFileData {
  originalname: string;
  cloudinaryUrl?: string;
  cloudinaryId?: string;
  googleFileUrl?: string;
  googleFileId?: string;
  mimetype?: string;
}

export interface FlashcardJobData {
  userId: string;
  dto: GenerateFlashcardDto;
  files?: ProcessedFileData[];
}

@Processor("flashcard-generation")
export class FlashcardProcessor extends WorkerHost {
  private readonly logger = new Logger(FlashcardProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super();
  }

  async process(job: Job<FlashcardJobData>): Promise<any> {
    const { userId, dto, files } = job.data;
    const jobId = job.id?.toString() || "unknown"; // Ensure jobId is string
    this.logger.log(
      `Processing flashcard generation job ${jobId} for user ${userId}`,
    );

    try {
      this.emitProgress(userId, jobId, "Starting flashcard generation...", 10);
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
        `Job ${jobId}: Using ${fileReferences.length} pre-uploaded file(s)`,
      );

      this.emitProgress(
        userId,
        jobId,
        `Processing ${fileReferences.length} file(s)...`,
        20,
      );
      await job.updateProgress(20);

      // Generate flashcards using AI with Google File API references
      this.logger.log(
        `Job ${jobId}: Generating flashcards with topic: "${dto.topic || "N/A"}"`,
      );
      this.emitProgress(
        userId,
        jobId,
        `Generating content with AI... This might take a moment.`,
        40,
      );

      const { cards } = await this.aiService.generateFlashcards({
        topic: dto.topic,
        content: dto.content,
        fileReferences, // Pass file references instead of buffers
        numberOfCards: dto.numberOfCards,
      });

      this.logger.log(`Job ${jobId}: Generated ${cards.length} flashcard(s)`);
      this.emitProgress(userId, jobId, "Finalizing and saving...", 85);
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
          title: this.generateTitle(dto, cards.length),
          topic: dto.topic || "General",
          cards: cards as any,
          userId,
          contentId: dto.contentId,
          sourceType,
          sourceFiles: googleFileUrls.length > 0 ? googleFileUrls : undefined,
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

      // Invalidate user's flashcard cache
      await this.cacheManager.del(`flashcards:all:${userId}`);

      await job.updateProgress(100);
      this.logger.log(
        `Job ${jobId}: Successfully completed (Set ID: ${flashcardSet.id})`,
      );

      this.eventEmitter.emit(
        EVENTS.FLASHCARD.COMPLETED,
        EventFactory.flashcardCompleted(userId, flashcardSet.id, cards.length, {
          title: flashcardSet.title,
        }),
      );

      return {
        success: true,
        flashcardSet,
      };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Failed to generate flashcards`,
        error.stack,
      );
      this.eventEmitter.emit(
        EVENTS.FLASHCARD.FAILED,
        EventFactory.flashcardFailed(userId, jobId, error.message),
      );
      throw error;
    }
  }

  private emitProgress(
    userId: string,
    jobId: string,
    step: string,
    percentage: number,
  ) {
    this.eventEmitter.emit(
      EVENTS.FLASHCARD.PROGRESS,
      EventFactory.flashcardProgress(userId, jobId, step, percentage),
    );
  }

  /**
   * Determine the primary source type for the flashcard set
   */
  private determineSourceType(
    dto: GenerateFlashcardDto,
    files?: ProcessedFileData[],
  ): string {
    if (files && files.length > 0) return "file";
    if (dto.content) return "text";
    return "topic";
  }

  /**
   * Generate a descriptive title for the flashcard set
   */
  private generateTitle(dto: GenerateFlashcardDto, cardCount: number): string {
    const topic = dto.topic || "General Knowledge";
    return `${topic} (${cardCount} cards)`;
  }
}
