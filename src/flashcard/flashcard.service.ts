import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { StreakService } from '../streak/streak.service';
import { ChallengeService } from '../challenge/challenge.service';
import { StudyService } from '../study/study.service';
import { GenerateFlashcardDto } from './dto/flashcard.dto';
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from '../file-storage/interfaces/file-storage.interface';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { processFileUploads } from '../common/helpers/file-upload.helpers';

const FLASHCARD_MIN_CARDS = 5;
const FLASHCARD_MAX_CARDS = 100;
const CACHE_TTL_MS = 300000; // 5 minutes

@Injectable()
export class FlashcardService {
  private readonly logger = new Logger(FlashcardService.name);

  constructor(
    @InjectQueue('flashcard-generation')
    private readonly flashcardQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly recommendationService: RecommendationService,
    private readonly streakService: StreakService,
    private readonly challengeService: ChallengeService,
    private readonly studyService: StudyService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('GOOGLE_FILE_STORAGE_SERVICE')
    private readonly googleFileStorageService: IFileStorageService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly cloudinaryFileStorageService: IFileStorageService,
    private readonly documentHashService: DocumentHashService
  ) {}

  /**
   * Generate flashcards from topic, content, or uploaded files
   */
  async generateFlashcards(
    userId: string,
    dto: GenerateFlashcardDto,
    files?: Express.Multer.File[]
  ) {
    this.validateFlashcardRequest(dto, files);

    this.logger.log(
      `User ${userId} requesting ${dto.numberOfCards} flashcard(s)`
    );

    const processedFiles = await this.processUploadedFiles(userId, files);

    try {
      const job = await this.flashcardQueue.add('generate', {
        userId,
        dto,
        files: processedFiles.map((doc) => ({
          originalname: doc.originalName,
          cloudinaryUrl: doc.cloudinaryUrl,
          cloudinaryId: doc.cloudinaryId,
          googleFileUrl: doc.googleFileUrl,
          googleFileId: doc.googleFileId,
          documentId: doc.documentId,
        })),
      });

      // Invalidate cache preemptively
      await this.invalidateUserCache(userId);

      this.logger.log(`Flashcard job created: ${job.id}`);
      return {
        jobId: job.id,
        status: 'pending',
      };
    } catch (error) {
      this.logger.error(
        `Failed to queue flashcard job for user ${userId}:`,
        error.stack
      );
      throw new BadRequestException(
        'Failed to start flashcard generation. Please try again.'
      );
    }
  }

  /**
   * Check the status of a flashcard generation job
   */
  async getJobStatus(jobId: string, userId: string) {
    this.logger.debug(`Checking job ${jobId} for user ${userId}`);

    const job = await this.flashcardQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const [state, progress] = await Promise.all([
      job.getState(),
      Promise.resolve(job.progress),
    ]);

    const progressString =
      typeof progress === 'object' ? JSON.stringify(progress) : progress;

    this.logger.debug(`Job ${jobId}: ${state} (${progressString}%)`);

    return {
      jobId: job.id,
      status: state,
      progress,
      result: state === 'completed' ? await job.returnvalue : null,
      error: state === 'failed' ? job.failedReason : null,
    };
  }

  /**
   * Retrieve all flashcard sets for a user (with caching)
   */
  async getAllFlashcardSets(userId: string) {
    const cacheKey = `flashcards:all:${userId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for user ${userId}`);
      return cached;
    }

    const flashcardSets = await this.prisma.flashcardSet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        topic: true,
        createdAt: true,
        cards: true,
        contentId: true,
      },
    });

    await this.cacheManager.set(cacheKey, flashcardSets, CACHE_TTL_MS);
    this.logger.debug(`Cached ${flashcardSets.length} sets for user ${userId}`);

    return flashcardSets;
  }

  /**
   * Retrieve a specific flashcard set by ID
   */
  async getFlashcardSetById(id: string, userId: string) {
    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id, userId },
    });

    if (!flashcardSet) {
      throw new NotFoundException('Flashcard set not found');
    }

    return flashcardSet;
  }

  /**
   * Record a user's flashcard study session
   */
  async recordFlashcardSession(
    userId: string,
    flashcardSetId: string,
    cardResponses: Array<{
      cardIndex: number;
      response: 'know' | 'dont-know' | 'skipped';
    }>
  ) {
    this.logger.log(
      `Recording session for user ${userId}, set ${flashcardSetId}`
    );

    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id: flashcardSetId, userId },
    });

    if (!flashcardSet) {
      throw new NotFoundException('Flashcard set not found');
    }

    const cards = flashcardSet.cards as any[];
    const metrics = this.calculateSessionMetrics(cardResponses, cards.length);

    // Save attempt to database
    const attempt = await this.prisma.attempt.create({
      data: {
        userId,
        flashcardSetId,
        type: 'flashcard',
        score: metrics.correctCount,
        totalQuestions: cards.length,
        answers: cardResponses,
      },
    });

    // Invalidate cache
    await this.invalidateUserCache(userId);

    // Update streak with correct answers for XP
    await this.streakService.updateStreak(
      userId,
      metrics.correctCount,
      cards.length
    );

    // Trigger async updates (non-blocking)
    this.updateChallengeProgressAsync(userId, metrics.isPerfect);
    this.updateTopicProgressAsync(
      userId,
      flashcardSet.topic,
      metrics.percentage,
      flashcardSet.contentId
    );
    this.generateRecommendationsAsync(userId);

    this.logger.log(
      `Session recorded: ${metrics.correctCount}/${cards.length} correct`
    );

    return {
      ...attempt,
      ...metrics,
    };
  }

  /**
   * Delete a flashcard set and associated resources
   */
  async deleteFlashcardSet(id: string, userId: string) {
    this.logger.log(`Deleting flashcard set ${id} for user ${userId}`);

    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id, userId },
    });

    if (!flashcardSet) {
      throw new NotFoundException('Flashcard set not found');
    }

    // Delete attempts first (foreign key constraint)
    await this.prisma.attempt.deleteMany({
      where: { flashcardSetId: id },
    });

    // Clean up Google File API resources
    await this.deleteGoogleFiles(flashcardSet.sourceFiles);

    // Delete document hash entries
    await this.deleteDocumentHashes(flashcardSet.sourceFiles);

    // Dereference from content if linked
    await this.dereferenceFromContent(flashcardSet.contentId, id);

    // Delete the flashcard set
    await this.prisma.flashcardSet.delete({
      where: { id },
    });

    // Invalidate cache
    await this.invalidateUserCache(userId);

    this.logger.log(`Flashcard set ${id} deleted`);
    return { success: true, message: 'Flashcard set deleted successfully' };
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Validate flashcard generation request
   */
  private validateFlashcardRequest(
    dto: GenerateFlashcardDto,
    files?: Express.Multer.File[]
  ): void {
    // Validate input sources
    if (!dto.topic && !dto.content && (!files || files.length === 0)) {
      throw new BadRequestException(
        'Please provide either a topic, content, or upload files to generate flashcards'
      );
    }

    // Validate number of cards
    if (
      !dto.numberOfCards ||
      dto.numberOfCards < FLASHCARD_MIN_CARDS ||
      dto.numberOfCards > FLASHCARD_MAX_CARDS
    ) {
      throw new BadRequestException(
        `Number of cards must be between ${FLASHCARD_MIN_CARDS} and ${FLASHCARD_MAX_CARDS}`
      );
    }
  }

  /**
   * Process uploaded files (upload to storage services)
   */
  private async processUploadedFiles(
    userId: string,
    files?: Express.Multer.File[]
  ) {
    if (!files || files.length === 0) {
      return [];
    }

    try {
      const processedDocs = await processFileUploads(
        files,
        this.documentHashService,
        this.cloudinaryFileStorageService,
        this.googleFileStorageService
      );

      const duplicateCount = processedDocs.filter((d) => d.isDuplicate).length;

      if (duplicateCount > 0) {
        this.logger.log(
          `Skipped ${duplicateCount} duplicate file(s) for user ${userId}`
        );
      }

      return processedDocs;
    } catch (error) {
      this.logger.error(
        `File processing failed for user ${userId}:`,
        error.stack
      );
      throw new BadRequestException(`Failed to upload files: ${error.message}`);
    }
  }

  /**
   * Calculate session metrics from card responses
   */
  private calculateSessionMetrics(
    cardResponses: Array<{ response: 'know' | 'dont-know' | 'skipped' }>,
    totalCards: number
  ) {
    const correctCount = cardResponses.filter(
      (r) => r.response === 'know'
    ).length;
    const incorrectCount = cardResponses.filter(
      (r) => r.response === 'dont-know'
    ).length;
    const skippedCount = cardResponses.filter(
      (r) => r.response === 'skipped'
    ).length;

    return {
      correctCount,
      incorrectCount,
      skippedCount,
      percentage: Math.round((correctCount / totalCards) * 100),
      isPerfect: correctCount === totalCards,
    };
  }

  /**
   * Delete files from Google File API
   */
  private async deleteGoogleFiles(sourceFiles?: string[]): Promise<void> {
    if (!sourceFiles || sourceFiles.length === 0) {
      return;
    }

    this.logger.debug(`Deleting ${sourceFiles.length} Google file(s)`);

    for (const fileUrl of sourceFiles) {
      try {
        // Extract file ID from Google File API URL
        // Format: https://generativelanguage.googleapis.com/v1beta/files/{fileId}
        const fileId = this.extractGoogleFileId(fileUrl);
        await this.googleFileStorageService.deleteFile(fileId);
      } catch (error) {
        this.logger.warn(`Failed to delete file ${fileUrl}: ${error.message}`);
      }
    }
  }

  /**
   * Extract Google File ID from URL
   */
  private extractGoogleFileId(fileUrl: string): string {
    if (fileUrl.includes('files/')) {
      const parts = fileUrl.split('files/')[1].split('?');
      return parts[0];
    }
    return fileUrl;
  }

  /**
   * Delete document hash entries from database
   */
  private async deleteDocumentHashes(sourceFiles?: string[]): Promise<void> {
    if (!sourceFiles || sourceFiles.length === 0) {
      return;
    }

    this.logger.debug(
      `Deleting document hashes for ${sourceFiles.length} file(s)`
    );

    for (const fileUrl of sourceFiles) {
      try {
        await this.documentHashService.deleteDocumentByGoogleFileUrl(fileUrl);
      } catch (error) {
        this.logger.warn(
          `Failed to delete document hash for ${fileUrl}: ${error.message}`
        );
      }
    }
  }

  /**
   * Remove flashcard set reference from content
   */
  private async dereferenceFromContent(
    contentId?: string,
    flashcardSetId?: string
  ): Promise<void> {
    if (!contentId) {
      return;
    }

    try {
      await this.prisma.content.update({
        where: { id: contentId },
        data: { flashcardSetId: null },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to dereference flashcard ${flashcardSetId} from content ${contentId}: ${error.message}`
      );
    }
  }

  /**
   * Invalidate user's flashcard cache
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    const cacheKey = `flashcards:all:${userId}`;
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Update challenge progress asynchronously
   */
  private updateChallengeProgressAsync(
    userId: string,
    isPerfect: boolean
  ): void {
    this.challengeService
      .updateChallengeProgress(userId, 'flashcard', isPerfect)
      .catch((err) =>
        this.logger.error(`Challenge update failed for ${userId}:`, err.stack)
      );
  }

  /**
   * Update topic progress asynchronously
   */
  private updateTopicProgressAsync(
    userId: string,
    topic: string,
    percentage: number,
    contentId?: string
  ): void {
    this.studyService
      .updateProgress(userId, topic, percentage, contentId)
      .catch((err) =>
        this.logger.error(
          `Topic progress update failed for ${userId}:`,
          err.stack
        )
      );
  }

  /**
   * Generate recommendations asynchronously
   */
  private generateRecommendationsAsync(userId: string): void {
    this.logger.debug(`Triggering recommendations for user ${userId}`);
    this.recommendationService
      .generateAndStoreRecommendations(userId)
      .catch((err) =>
        this.logger.error(
          `Recommendation generation failed for ${userId}:`,
          err.stack
        )
      );
  }
}
