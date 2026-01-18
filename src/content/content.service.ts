import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/services/cache.service';
import { CreateContentDto, UpdateContentDto } from './dto/content.dto';
import { QuizService } from '../quiz/quiz.service';
import { FlashcardService } from '../flashcard/flashcard.service';
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from '../file-storage/interfaces/file-storage.interface';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { FileCompressionService } from '../file-storage/services/file-compression.service';
import {
  processFileUploads,
  ProcessedDocument,
} from '../common/helpers/file-upload.helpers';
import { UserDocumentService } from '../user-document/user-document.service';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { LangChainService } from '../langchain/langchain.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

interface ContentWithRelations {
  id: string;
  quizId?: string | null;
  flashcardSetId?: string | null;
  quiz?: { id: string } | null;
  flashcardSet?: { id: string } | null;
  studyPack?: { id: string; title: string } | null;
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    @InjectQueue('content-generation')
    private readonly contentQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly quizService: QuizService,
    private readonly flashcardService: FlashcardService,
    private readonly cacheService: CacheService,
    @Inject('GOOGLE_FILE_STORAGE_SERVICE')
    private readonly googleFileStorageService: IFileStorageService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly cloudinaryFileStorageService: IFileStorageService,
    private readonly documentHashService: DocumentHashService,
    private readonly fileCompressionService: FileCompressionService,
    private readonly userDocumentService: UserDocumentService,
    private readonly quotaService: QuotaService,
    private readonly studyPackService: StudyPackService
  ) {}

  /**
   * Queue content generation job
   *
   * Supports three generation modes:
   * 1. Topic alone - generate content from topic
   * 2. Content (with/without title) - generate from provided content, auto-generate title if missing
   * 3. Files - from uploaded files or selected files (or both)
   */
  async generate(
    userId: string,
    dto: CreateContentDto,
    files?: Express.Multer.File[]
  ) {
    this.validateContentRequest(dto, files);

    this.logger.log(`User ${userId} requesting content generation`);

    // Process uploaded files and fetch selected files in parallel
    const [processedFiles, selectedFiles] = await Promise.all([
      this.processUploadedFiles(userId, files),
      this.fetchSelectedFiles(userId, dto.selectedFileIds),
    ]);

    // Merge both file sources
    const allFiles = [...processedFiles, ...selectedFiles];

    this.logger.log(
      `Preparing job with ${allFiles.length} file(s) (${processedFiles.length} new, ${selectedFiles.length} selected)`
    );

    try {
      const job = await this.contentQueue.add('generate', {
        userId,
        dto,
        files: allFiles.map((doc) => ({
          originalname: doc.originalName,
          cloudinaryUrl: doc.cloudinaryUrl,
          cloudinaryId: doc.cloudinaryId,
          googleFileUrl: doc.googleFileUrl,
          googleFileId: doc.googleFileId,
          documentId: doc.documentId,
          mimetype: doc.mimeType,
          size: doc.size,
        })),
      });

      await this.invalidateUserCache(userId);

      this.logger.log(`Content job created: ${job.id}`);
      return {
        jobId: job.id,
        status: 'pending',
      };
    } catch (error) {
      this.logger.error(
        `Failed to queue content job for user ${userId}:`,
        error.stack
      );
      throw new BadRequestException(
        'Failed to start content generation. Please try again.'
      );
    }
  }

  /**
   * Get content generation job status
   */
  async getJobStatus(jobId: string, userId: string) {
    this.logger.debug(`Checking job ${jobId} for user ${userId}`);

    const job = await this.contentQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const [state, progress] = await Promise.all([
      job.getState(),
      Promise.resolve(job.progress),
    ]);

    this.logger.debug(`Job ${jobId}: ${state} (${JSON.stringify(progress)}%)`);

    return {
      jobId: job.id,
      status: state,
      progress,
      result: state === 'completed' ? await job.returnvalue : null,
      error: state === 'failed' ? job.failedReason : null,
    };
  }

  /**
   * Get all content for a user with pagination
   */
  async getContents(
    userId: string,
    topic?: string,
    page: number = DEFAULT_PAGE,
    limit: number = DEFAULT_LIMIT
  ) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.content.findMany({
        where: {
          userId,
          ...(topic ? { topic } : {}),
        },
        select: {
          id: true,
          title: true,
          topic: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          quiz: { select: { id: true } },
          flashcardSet: { select: { id: true } },
          studyPack: { select: { id: true, title: true } },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.content.count({
        where: {
          userId,
          ...(topic ? { topic } : {}),
        },
      }),
    ]);

    const mappedData = data.map((item) => {
      return {
        id: item.id,
        title: item.title,
        topic: item.topic,
        description: item.description,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        quizId: item.quiz ? item.quiz.id : undefined,
        flashcardSetId: item.flashcardSet ? item.flashcardSet.id : undefined,
        studyPack: item.studyPack,
      };
    });

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single content item by ID
   */
  async getContentById(userId: string, contentId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      include: {
        quiz: {
          select: { id: true },
        },
        flashcardSet: {
          select: { id: true },
        },
        studyPack: {
          select: {
            id: true,
            title: true,
          },
        },
        summary: {
          select: {
            id: true,
            shortCode: true,
          },
        },
      },
    });

    if (content?.userId !== userId) {
      throw new NotFoundException('Content not found');
    }

    // Backfill missing IDs from relations (backward compatibility)
    await this.backfillContentRelations(content);

    return this.normalizeContentRelations(content);
  }

  async searchContent(userId: string, query: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const contents = await this.prisma.content.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { topic: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        topic: true,
        createdAt: true,
        quiz: { select: { id: true } },
        flashcardSet: { select: { id: true } },
      },
      take: 5,
    });

    return contents.map((content) => ({
      id: content.id,
      title: content.title,
      type: 'content',
      metadata: content.topic,
      url: `/content/${content.id}`,
    }));
  }

  /**
   * Update content
   */
  async updateContent(
    userId: string,
    contentId: string,
    updateContentDto: UpdateContentDto
  ) {
    const updatedContent = await this.prisma.content.update({
      where: { id: contentId },
      data: updateContentDto,
    });

    await this.invalidateUserCache(userId);
    await this.studyPackService.invalidateUserCache(userId);

    return updatedContent;
  }

  /**
   * Delete content and associated resources
   */
  async deleteContent(userId: string, contentId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });

    if (content?.userId !== userId) {
      throw new NotFoundException('Content not found');
    }

    // Delete associated quiz
    if (content.quizId) {
      await this.deleteQuizSilently(content.quizId, userId);
    }

    // Delete associated flashcard set
    if (content.flashcardSetId) {
      await this.deleteFlashcardSetSilently(content.flashcardSetId, userId);
    }

    const deleted = await this.prisma.content.delete({
      where: { id: contentId },
    });

    await this.invalidateUserCache(userId);
    await this.studyPackService.invalidateUserCache(userId);

    this.logger.log(`Content ${contentId} deleted successfully`);
    return deleted;
  }

  // ==================== AI FEATURES ====================

  /**
   * Generate explanation for a section
   */
  async generateExplanation(
    userId: string,
    contentId: string,
    sectionTitle: string,
    sectionContent: string
  ) {
    const cacheKey = `explanation:${contentId}:${sectionTitle}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for explanation: ${cacheKey}`);
      return cached;
    }

    const prompt = `Explain the concept "${sectionTitle}" in the context of:
${sectionContent}

Provide a clear, detailed explanation suitable for a student. Keep it engaging and informative.`;

    const result = await this.langchainService.invoke(prompt, {
      task: 'explanation',
      complexity: 'simple',
    });

    await this.quotaService.incrementQuota(userId, 'conceptExplanation');

    await this.cacheService.set(cacheKey, result, 43200000);

    return result;
  }

  /**
   * Generate example for a section
   */
  async generateExample(
    userId: string,
    contentId: string,
    sectionTitle: string,
    sectionContent: string
  ) {
    const cacheKey = `example:${contentId}:${sectionTitle}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for example: ${cacheKey}`);
      return cached;
    }

    const prompt = `Provide a practical example of the concept "${sectionTitle}" based on this content:
${sectionContent}

The example should be relatable and help illustrate the concept clearly.`;

    const result = await this.langchainService.invoke(prompt, {
      task: 'example',
      complexity: 'simple',
    });

    await this.quotaService.incrementQuota(userId, 'conceptExplanation');

    await this.cacheService.set(cacheKey, result, 43200000);

    return result;
  }

  // ==================== ANALYTICS ====================

  /**
   * Get popular topics across all users
   */
  async getPopularTopics() {
    const topics = await this.prisma.content.groupBy({
      by: ['topic'],
      where: {
        topic: {
          not: '',
        },
      },
      _count: {
        topic: true,
      },
      orderBy: {
        _count: {
          topic: 'desc',
        },
      },
      take: 5,
    });

    return topics.map((t) => t.topic);
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

    const results: ProcessedDocument[] = [];

    this.logger.log(
      `Fetching ${selectedFileIds.length} selected file(s) for user ${userId}`
    );

    for (const userDocId of selectedFileIds) {
      try {
        const userDoc = await this.userDocumentService.getUserDocumentById(
          userId,
          userDocId
        );

        this.logger.debug(
          `Fetched document: ${userDoc.displayName}, googleFileUrl: ${userDoc.document.googleFileUrl || 'null'}`
        );

        results.push({
          originalName: userDoc.displayName,
          cloudinaryUrl: userDoc.document.cloudinaryUrl,
          cloudinaryId: userDoc.document.id, // Use document ID as fallback
          googleFileUrl: userDoc.document.googleFileUrl || undefined,
          googleFileId: undefined, // Not available in DTO
          hash: '', // Not needed for existing files
          isDuplicate: true, // Mark as duplicate since it's already uploaded
          documentId: userDoc.document.id,
          mimeType: userDoc.document.mimeType,
          size: userDoc.document.sizeBytes || 0,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to fetch user document ${userDocId}: ${error.message}`
        );
      }
    }

    this.logger.log(
      `Successfully fetched ${results.length} selected file(s) for user ${userId}`
    );

    return results;
  }

  /**
   * Validate content generation request
   */
  private validateContentRequest(
    dto: { topic?: string; content?: string; selectedFileIds?: string[] },
    files?: Express.Multer.File[]
  ): void {
    const hasFiles = files && files.length > 0;
    const hasSelectedFiles =
      dto.selectedFileIds && dto.selectedFileIds.length > 0;

    if (!dto.topic && !dto.content && !hasFiles && !hasSelectedFiles) {
      throw new BadRequestException(
        'Please provide either a topic, content, or upload files to generate study material'
      );
    }
  }

  /**
   * Process uploaded files
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
        this.googleFileStorageService,
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
   * Normalize content relations (remove nested objects)
   */
  private normalizeContentRelations(content: ContentWithRelations) {
    return {
      ...content,
      quizId: content.quizId || content.quiz?.id,
      flashcardSetId: content.flashcardSetId || content.flashcardSet?.id,
      quiz: undefined,
      flashcardSet: undefined,
    };
  }

  /**
   * Backfill missing relation IDs from nested objects
   */
  private async backfillContentRelations(
    content: ContentWithRelations
  ): Promise<void> {
    const updates: Record<string, string> = {};

    if (!content.quizId && content.quiz?.id) {
      updates.quizId = content.quiz.id;
    }

    if (!content.flashcardSetId && content.flashcardSet?.id) {
      updates.flashcardSetId = content.flashcardSet.id;
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.content
        .update({
          where: { id: content.id },
          data: updates,
        })
        .catch((error) => {
          this.logger.warn(
            `Failed to backfill relations for ${content.id}:`,
            error.message
          );
        });
    }
  }

  /**
   * Delete quiz silently (ignore errors)
   */
  private async deleteQuizSilently(
    quizId: string,
    userId: string
  ): Promise<void> {
    try {
      await this.quizService.deleteQuiz(quizId, userId);
    } catch (error) {
      this.logger.warn(`Failed to delete quiz ${quizId}:`, error.message);
    }
  }

  /**
   * Delete flashcard set silently (ignore errors)
   */
  private async deleteFlashcardSetSilently(
    flashcardSetId: string,
    userId: string
  ): Promise<void> {
    try {
      await this.flashcardService.deleteFlashcardSet(flashcardSetId, userId);
    } catch (error) {
      this.logger.warn(
        `Failed to delete flashcard set ${flashcardSetId}:`,
        error.message
      );
    }
  }

  /**
   * Invalidate user cache
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheService.invalidateByPattern(`content:all:${userId}*`);
  }
}
