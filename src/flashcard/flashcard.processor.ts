import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, Inject } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { GenerateFlashcardDto } from "./dto/flashcard.dto";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom } from "rxjs";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";

export interface FlashcardJobData {
  userId: string;
  dto: GenerateFlashcardDto;
  files?: any[];
}

@Processor("flashcard-generation")
export class FlashcardProcessor extends WorkerHost {
  private readonly logger = new Logger(FlashcardProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super();
  }

  async process(job: Job<FlashcardJobData>): Promise<any> {
    const { userId, dto, files } = job.data;
    this.logger.log(
      `Processing flashcard generation job ${job.id} for user ${userId}`,
    );

    try {
      // Update progress
      await job.updateProgress(10);
      this.logger.debug(`Job ${job.id}: Converting file data`);

      // Download files if URLs are present
      const processedFiles: any[] = [];
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.url) {
            try {
              this.logger.debug(`Downloading file from ${file.url}`);
              const response = await lastValueFrom(
                this.httpService.get(file.url, { responseType: "arraybuffer" }),
              );
              processedFiles.push({
                buffer: Buffer.from(response.data),
                originalname: file.originalname,
                mimetype: file.mimetype,
              });
            } catch (error) {
              this.logger.error(
                `Failed to download file ${file.originalname}:`,
                error,
              );
              throw error;
            }
          } else {
            // Fallback for local paths (though likely undefined in this context)
            processedFiles.push(file);
          }
        }
      }

      await job.updateProgress(20);

      // Generate flashcards using AI
      this.logger.log(
        `Job ${job.id}: Calling AI service to generate flashcards`,
      );
      const { cards, title, topic } = await this.aiService.generateFlashcards({
        topic: dto.topic,
        content: dto.content,
        files: processedFiles,
        numberOfCards: dto.numberOfCards,
      });

      this.logger.log(`Job ${job.id}: AI generated ${cards.length} flashcards`);
      await job.updateProgress(70);

      // Determine source type
      let sourceType = "topic";
      if (dto.content) sourceType = "text";
      if (files && files.length > 0) sourceType = "file";

      // Get file URLs from job data
      const fileUrls = files?.map((f) => f.url).filter(Boolean) || [];

      await job.updateProgress(85);

      // Save flashcard set to database
      this.logger.debug(`Job ${job.id}: Saving flashcard set to database`);
      const flashcardSet = await this.prisma.flashcardSet.create({
        data: {
          title: `Flashcards: ${dto.topic || "General Knowledge"}`,
          topic: dto.topic || "General",
          cards: cards as any,
          userId,
          contentId: dto.contentId,
        },
      });

      // Update content flashcardSetId mapping if applicable
      if (dto.contentId) {
        await this.prisma.content.update({
          where: { id: dto.contentId },
          data: { flashcardSetId: flashcardSet.id },
        });
      }

      // Invalidate cache
      await this.cacheManager.del(`flashcards:all:${userId}`);

      await job.updateProgress(100);
      this.logger.log(
        `Job ${job.id}: Flashcard generation completed successfully (Set ID: ${flashcardSet.id})`,
      );

      return {
        success: true,
        flashcardSet,
      };
    } catch (error) {
      this.logger.error(`Job ${job.id}: Flashcard generation failed`, error);
      throw error;
    }
  }
}
