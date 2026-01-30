import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { StreakService } from '../streak/streak.service';
import { ChallengeService } from '../challenge/challenge.service';
import { StudyService } from '../study/study.service';
import { GenerateFlashcardDto } from './dto/flashcard.dto';
import { FILE_STORAGE_SERVICE, IFileStorageService } from '../file-storage/interfaces/file-storage.interface';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import { ProcessedDocument, processFileUploads } from '../common/helpers/file-upload.helpers';
import { UserDocumentService } from '../user-document/user-document.service';
import { StudyPackService } from '../study-pack/study-pack.service';

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
    @Inject('GOOGLE_FILE_STORAGE_SERVICE')
    private readonly googleFileStorageService: IFileStorageService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly cloudinaryFileStorageService: IFileStorageService,
    private readonly documentHashService: DocumentHashService,
    private readonly fileCompressionService: FileCompressionService,
    private readonly userDocumentService: UserDocumentService,
    private readonly studyPackService: StudyPackService
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

    const [processedFiles, selectedFiles] = await Promise.all([
      this.processUploadedFiles(userId, files),
      this.fetchSelectedFiles(userId, dto.selectedFileIds),
    ]);

    const allFiles = [...processedFiles, ...selectedFiles];

    try {
      const job = await this.flashcardQueue.add('generate', {
        userId,
        dto,
        files: allFiles.map((doc) => ({
          originalname: doc.originalName,
          cloudinaryUrl: doc.cloudinaryUrl,
          cloudinaryId: doc.cloudinaryId,
          documentId: doc.documentId,
          mimetype: doc.mimeType,
          size: doc.size,
        })),
      });

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
  async getAllFlashcardSets(
    userId: string,
    page: number = 1,
    limit: number = 20,
    studyPackId?: string
  ) {
    const skip = (page - 1) * limit;

    const [flashcardSets, total] = await Promise.all([
      this.prisma.flashcardSet.findMany({
        where: {
          userId,
          ...(studyPackId ? { studyPackId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          topic: true,
          createdAt: true,
          cards: true, // Get JSON to count
          _count: {
            select: {
              attempts: true,
            },
          },
          studyPack: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      this.prisma.flashcardSet.count({
        where: {
          userId,
          ...(studyPackId ? { studyPackId } : {}),
        },
      }),
    ]);

    const transformedSets = flashcardSets.map((set) => {
      const cards = Array.isArray(set.cards)
        ? set.cards
        : JSON.parse(set.cards as string);

      return {
        id: set.id,
        title: set.title,
        topic: set.topic,
        createdAt: set.createdAt,
        cardCount: cards.length,
        attemptCount: set._count.attempts,
        studyPack: set.studyPack,
      };
    });

    return {
      data: transformedSets,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve a specific flashcard set by ID
   */
  async getFlashcardSetById(id: string, userId: string) {
    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id, userId },
      include: {
        studyPack: {
          select: {
            id: true,
            title: true,
          },
        },
        _count: {
          select: {
            attempts: true,
          },
        },
      },
    });

    if (!flashcardSet) {
      throw new NotFoundException('Flashcard set not found');
    }

    return flashcardSet;
  }

  async searchFlashcardSets(userId: string, query: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const sets = await this.prisma.flashcardSet.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { topic: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        topic: true,
        createdAt: true,
        cards: true, // Needed for count
      },
      take: 5,
    });

    return sets.map((set) => ({
      id: set.id,
      title: set.title,
      type: 'flashcard',
      metadata: `${(set.cards as any[]).length} Cards`,
      url: `/flashcards/${set.id}`,
    }));
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
   * Get all attempts for a specific flashcard set
   */
  async getFlashcardAttempts(flashcardSetId: string, userId: string) {
    this.logger.log(
      `Fetching attempts for flashcard set ${flashcardSetId}, user ${userId}`
    );

    // Verify flashcard set exists and belongs to user
    const flashcardSet = await this.prisma.flashcardSet.findFirst({
      where: { id: flashcardSetId, userId },
      select: { id: true },
    });

    if (!flashcardSet) {
      throw new NotFoundException('Flashcard set not found');
    }

    // Fetch all attempts for this flashcard set
    const attempts = await this.prisma.attempt.findMany({
      where: {
        flashcardSetId,
        userId,
        type: 'flashcard',
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        flashcardSetId: true,
        score: true,
        totalQuestions: true,
        completedAt: true,
        answers: true,
      },
    });

    this.logger.log(
      `Found ${attempts.length} attempts for flashcard set ${flashcardSetId}`
    );

    return attempts;
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

    await this.studyPackService.invalidateUserCache(userId);

    this.logger.log(`Flashcard set ${id} deleted`);
    return { success: true, message: 'Flashcard set deleted successfully' };
  }

  async updateTitle(id: string, userId: string, title: string) {
    const set = await this.prisma.flashcardSet.findFirst({
      where: { id, userId },
    });

    if (!set) {
      throw new NotFoundException('Flashcard set not found');
    }

    const updatedSet = await this.prisma.flashcardSet.update({
      where: { id },
      data: { title },
    });

    return updatedSet;
  }

  /**
   * Validate flashcard generation request
   */
  private validateFlashcardRequest(
    dto: GenerateFlashcardDto,
    files?: Express.Multer.File[]
  ): void {
    // Validate input sources
    if (
      !dto.topic &&
      !dto.content &&
      (!files || files.length === 0) &&
      (!dto.selectedFileIds || dto.selectedFileIds.length === 0)
    ) {
      throw new BadRequestException(
        'Please provide either a topic, content, or upload files to generate flashcards'
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
        this.fileCompressionService
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

  /**
   * Fetch selected files from UserDocuments
   */
  private async fetchSelectedFiles(
    userId: string,
    selectedFileIds?: string[]
  ): Promise<ProcessedDocument[]> {
    if (!selectedFileIds || selectedFileIds.length === 0) {
      return [];
    }

    this.logger.log(
      `Fetching ${selectedFileIds.length} selected file(s) for user ${userId}`
    );

    try {
      // Use efficient batch fetch
      const userDocs = await this.userDocumentService.getUserDocumentsByIds(
        userId,
        selectedFileIds
      );

      this.logger.debug(`Successfully fetched ${userDocs.length} documents`);

      return userDocs.map((userDoc: any) => ({
        originalName: userDoc.displayName,
        cloudinaryUrl: userDoc.document.cloudinaryUrl,
        cloudinaryId: userDoc.document.id, // Use document ID as fallback/identifier
        googleFileUrl: userDoc.document.googleFileUrl || undefined,
        googleFileId: userDoc.document.googleFileId,
        hash: '', // Not needed for existing files
        isDuplicate: true, // Mark as duplicate since it's already uploaded
        documentId: userDoc.document.id,
        mimeType: userDoc.document.mimeType,
        size: userDoc.document.sizeBytes || 0,
      }));
    } catch (error) {
      this.logger.warn(
        `Failed to fetch selected files for user ${userId}: ${error.message}`
      );
      return [];
    }
  }
}
