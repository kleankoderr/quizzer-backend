import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
  BadRequestException,
} from "@nestjs/common";

// ... existing imports ...

import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { PrismaService } from "../prisma/prisma.service";
import { RecommendationService } from "../recommendation/recommendation.service";
import { StreakService } from "../streak/streak.service";
import { ChallengeService } from "../challenge/challenge.service";
import { GenerateFlashcardDto } from "./dto/flashcard.dto";
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from "../file-storage/interfaces/file-storage.interface";
import { DocumentHashService } from "../file-storage/services/document-hash.service";
import { processFileUploads } from "../common/helpers/file-upload.helpers";

@Injectable()
export class FlashcardService {
  private readonly logger = new Logger(FlashcardService.name);

  constructor(
    @InjectQueue("flashcard-generation") private readonly flashcardQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly recommendationService: RecommendationService,
    private readonly streakService: StreakService,
    private readonly challengeService: ChallengeService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject("GOOGLE_FILE_STORAGE_SERVICE")
    private readonly googleFileStorageService: IFileStorageService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly cloudinaryFileStorageService: IFileStorageService,
    private readonly documentHashService: DocumentHashService,
  ) {}

  async generateFlashcards(
    userId: string,
    dto: GenerateFlashcardDto,
    files?: Express.Multer.File[],
  ) {
    // Enhanced validation
    if (!dto.topic && !dto.content && (!files || files.length === 0)) {
      this.logger.warn(
        `User ${userId} attempted flashcard generation without any input`,
      );
      throw new Error(
        "Please provide either a topic, content, or upload files to generate flashcards",
      );
    }

    // Validate numberOfCards
    if (
      !dto.numberOfCards ||
      dto.numberOfCards < 5 ||
      dto.numberOfCards > 100
    ) {
      this.logger.warn(
        `User ${userId} provided invalid numberOfCards: ${dto.numberOfCards}`,
      );
      throw new Error("Number of cards must be between 5 and 100");
    }

    this.logger.log(
      `User ${userId} requesting flashcard generation: ${dto.numberOfCards} cards`,
    );

    let processedDocs = [];

    if (files && files.length > 0) {
      try {
        processedDocs = await processFileUploads(
          files,
          this.documentHashService,
          this.cloudinaryFileStorageService,
          this.googleFileStorageService,
        );

        const duplicateCount = processedDocs.filter(
          (d) => d.isDuplicate,
        ).length;
        if (duplicateCount > 0) {
          this.logger.log(
            `Skipped ${duplicateCount} duplicate file(s) for user ${userId}`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to process files for user ${userId}:`, error);
        throw new Error(`Failed to upload files: ${error.message}`);
      }
    }

    try {
      // Add job to queue
      const job = await this.flashcardQueue.add(
        "generate",
        {
          userId,
          dto,
          files: processedDocs.map((doc) => ({
            originalname: doc.originalName,
            cloudinaryUrl: doc.cloudinaryUrl,
            cloudinaryId: doc.cloudinaryId,
            googleFileUrl: doc.googleFileUrl,
            googleFileId: doc.googleFileId,
          })),
        },
        {
          removeOnComplete: { age: 60 }, // Keep for 1 minute
          removeOnFail: { age: 60 }, // Keep for 1 minute
          attempts: 2, // Retry 1 time
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      );

      // Invalidate flashcard cache after new set is generated
      const cacheKey = `flashcards:all:${userId}`;
      await this.cacheManager.del(cacheKey);

      this.logger.log(`Flashcard generation job created with ID: ${job.id}`);
      return {
        jobId: job.id,
        status: "pending",
      };
    } catch (error) {
      this.logger.error(
        `Failed to create flashcard generation job for user ${userId}:`,
        error,
      );
      throw new Error(
        "Failed to start flashcard generation. Please try again.",
      );
    }
  }

  async getJobStatus(jobId: string, userId: string) {
    this.logger.debug(
      `Checking flashcard job status for job ${jobId}, user ${userId}`,
    );
    const job = await this.flashcardQueue.getJob(jobId);

    if (!job) {
      this.logger.warn(`Flashcard job ${jobId} not found`);
      throw new NotFoundException("Job not found");
    }

    // Security: check if job belongs to user
    if (job.data.userId !== userId) {
      this.logger.warn(
        `User ${userId} attempted to access flashcard job ${jobId} owned by ${job.data.userId}`,
      );
      throw new NotFoundException("Job not found");
    }

    const state = await job.getState();
    const progress = job.progress;

    this.logger.debug(
      `Flashcard job ${jobId} status: ${state}, progress: ${JSON.stringify(progress)}`,
    );

    return {
      jobId: job.id,
      status: state,
      progress,
      result: state === "completed" ? await job.returnvalue : null,
      error: state === "failed" ? job.failedReason : null,
    };
  }

  async getAllFlashcardSets(userId: string) {
    const cacheKey = `flashcards:all:${userId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for all flashcard sets, user ${userId}`);
      return cached;
    }

    const flashcardSets = await this.prisma.flashcardSet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        topic: true,
        createdAt: true,
        cards: true,
      },
    });

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, flashcardSets, 300000);

    return flashcardSets;
  }

  async getFlashcardSetById(id: string, userId: string) {
    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id, userId },
    });

    if (!flashcardSet) {
      throw new NotFoundException("Flashcard set not found");
    }

    return flashcardSet;
  }

  async recordFlashcardSession(
    userId: string,
    flashcardSetId: string,
    cardResponses: Array<{
      cardIndex: number;
      response: "know" | "dont-know" | "skipped";
    }>,
  ) {
    this.logger.log(
      `User ${userId} recording flashcard session for set ${flashcardSetId}`,
    );
    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id: flashcardSetId, userId },
    });

    if (!flashcardSet) {
      this.logger.warn(
        `Flashcard set ${flashcardSetId} not found for user ${userId}`,
      );
      throw new NotFoundException("Flashcard set not found");
    }

    const cards = flashcardSet.cards as any[];

    // Calculate score based on responses
    // know = +1, dont-know = 0, skipped = 0
    // We only count correct answers for the score to match user expectations for percentage calculation
    let score = 0;
    for (const response of cardResponses) {
      if (response.response === "know") {
        score += 1;
      }
    }

    // Save attempt with detailed answers
    const attempt = await this.prisma.attempt.create({
      data: {
        userId,
        flashcardSetId,
        type: "flashcard",
        score,
        totalQuestions: cards.length,
        answers: cardResponses, // Store individual responses
      },
    });

    // Invalidate flashcard cache after session
    await this.cacheManager.del(`flashcards:all:${userId}`);

    // Update streak with positive responses count for XP calculation
    const correctCount = cardResponses.filter(
      (r) => r.response === "know",
    ).length;
    await this.streakService.updateStreak(userId, correctCount, cards.length);

    // Update challenge progress based on cards marked as 'know'
    const isPerfect = correctCount === cards.length;
    this.challengeService
      .updateChallengeProgress(userId, "flashcard", isPerfect)
      .catch((err) =>
        this.logger.error(
          `Failed to update challenge progress for user ${userId}:`,
          err,
        ),
      );

    // Generate and store recommendations based on this flashcard session.
    // Do not block response — run asynchronously.
    this.logger.debug(
      `Triggering recommendation generation for user ${userId}`,
    );
    this.recommendationService
      .generateAndStoreRecommendations(userId)
      .catch((err) =>
        this.logger.error(
          `Failed to generate recommendations for user ${userId}:`,
          err,
        ),
      );

    this.logger.log(
      `Flashcard session recorded: ${correctCount} correct, score: ${score}`,
    );
    return {
      ...attempt,
      correctCount,
      incorrectCount: cardResponses.filter((r) => r.response === "dont-know")
        .length,
      skippedCount: cardResponses.filter((r) => r.response === "skipped")
        .length,
    };
  }

  async deleteFlashcardSet(id: string, userId: string) {
    this.logger.log(`User ${userId} deleting flashcard set ${id}`);

    // Verify ownership
    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id, userId },
    });

    if (!flashcardSet) {
      this.logger.warn(`Flashcard set ${id} not found for user ${userId}`);
      throw new NotFoundException("Flashcard set not found");
    }

    // Delete associated attempts first
    await this.prisma.attempt.deleteMany({
      where: { flashcardSetId: id },
    });

    // Delete associated files from Google File API
    if (flashcardSet.sourceFiles && flashcardSet.sourceFiles.length > 0) {
      this.logger.debug(
        `Deleting ${flashcardSet.sourceFiles.length} files from Google File API`,
      );
      for (const fileUrl of flashcardSet.sourceFiles) {
        try {
          // Extract file name from Google File URI
          // URI format: https://generativelanguage.googleapis.com/v1beta/files/abc123
          const fileName = fileUrl.includes("files/")
            ? fileUrl.split("files/")[1].split("?")[0]
            : fileUrl;
          const publicId = fileName.startsWith("files/")
            ? fileName
            : `files/${fileName}`;
          await this.googleFileStorageService.deleteFile(publicId);
        } catch (error) {
          this.logger.warn(
            `Failed to delete file ${fileUrl}: ${error.message}`,
          );
        }
      }
    }

    // Dereference from content if applicable
    if (flashcardSet.contentId) {
      try {
        await this.prisma.content.update({
          where: { id: flashcardSet.contentId },
          data: { flashcardSetId: null },
        });
      } catch (error) {
        // Ignore if content not found or other error
        this.logger.warn(
          `Failed to dereference flashcard set ${id} from content ${flashcardSet.contentId}: ${error.message}`,
        );
      }
    }

    // Delete the flashcard set
    await this.prisma.flashcardSet.delete({
      where: { id },
    });

    // Invalidate cache
    await this.cacheManager.del(`flashcards:all:${userId}`);

    this.logger.log(`Flashcard set ${id} deleted successfully`);
    return { success: true, message: "Flashcard set deleted successfully" };
  }
}
