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
import { AiService } from '../ai/ai.service';
import {
  CreateContentDto,
  CreateHighlightDto,
  UpdateContentDto,
} from './dto/content.dto';
import { QuizService } from '../quiz/quiz.service';
import { FlashcardService } from '../flashcard/flashcard.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from '../file-storage/interfaces/file-storage.interface';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { processFileUploads } from '../common/helpers/file-upload.helpers';

const MAX_LEARNING_GUIDE_LENGTH = 10000;
const AI_ENHANCEMENT_MAX_TOKENS = 2000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

interface ContentWithRelations {
  id: string;
  quizId?: string | null;
  flashcardSetId?: string | null;
  quiz?: { id: string } | null;
  flashcardSet?: { id: string } | null;
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    @InjectQueue('content-generation')
    private readonly contentQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly quizService: QuizService,
    private readonly flashcardService: FlashcardService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject('GOOGLE_FILE_STORAGE_SERVICE')
    private readonly googleFileStorageService: IFileStorageService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly cloudinaryFileStorageService: IFileStorageService,
    private readonly documentHashService: DocumentHashService
  ) {}

  /**
   * Queue content generation job
   */
  async generate(
    userId: string,
    dto: { topic?: string; content?: string },
    files?: Express.Multer.File[]
  ) {
    this.validateContentRequest(dto, files);

    this.logger.log(`User ${userId} requesting content generation`);

    const processedFiles = await this.processUploadedFiles(userId, files);

    try {
      const job = await this.contentQueue.add('generate', {
        userId,
        dto,
        files: processedFiles.map((doc) => ({
          originalname: doc.originalName,
          cloudinaryUrl: doc.cloudinaryUrl,
          cloudinaryId: doc.cloudinaryId,
          googleFileUrl: doc.googleFileUrl,
          googleFileId: doc.googleFileId,
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

  // ==================== CONTENT CRUD ====================

  /**
   * Create content manually
   */
  async createContent(userId: string, createContentDto: CreateContentDto) {
    await this.verifyUserExists(userId);

    const enhancedContent = await this.enhanceContentWithAI(
      createContentDto.content
    );

    const content = await this.prisma.content.create({
      data: {
        ...createContentDto,
        content: enhancedContent,
        userId,
      },
    });

    // Generate learning guide in background
    this.generateLearningGuideAsync(
      content.id,
      createContentDto.topic,
      enhancedContent
    );

    await this.invalidateUserCache(userId);

    return content;
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
        include: {
          quiz: { select: { id: true } },
          flashcardSet: { select: { id: true } },
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

    const mappedData = data.map((item) => this.normalizeContentRelations(item));

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
        highlights: true,
        quiz: {
          select: { id: true },
        },
        flashcardSet: {
          select: { id: true },
        },
      },
    });

    if (!content || content.userId !== userId) {
      throw new NotFoundException('Content not found');
    }

    // Backfill missing IDs from relations (backward compatibility)
    await this.backfillContentRelations(content);

    return this.normalizeContentRelations(content);
  }

  /**
   * Update content
   */
  async updateContent(
    userId: string,
    contentId: string,
    updateContentDto: UpdateContentDto
  ) {
    await this.verifyContentOwnership(userId, contentId);

    const updatedContent = await this.prisma.content.update({
      where: { id: contentId },
      data: updateContentDto,
    });

    await this.invalidateUserCache(userId);

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

    this.logger.log(`Content ${contentId} deleted successfully`);
    return deleted;
  }

  // ==================== HIGHLIGHTS ====================

  /**
   * Add a highlight to content
   */
  async addHighlight(
    userId: string,
    contentId: string,
    createHighlightDto: CreateHighlightDto
  ) {
    await this.verifyContentOwnership(userId, contentId);

    return this.prisma.highlight.create({
      data: {
        ...createHighlightDto,
        contentId,
        userId,
      },
    });
  }

  /**
   * Delete a highlight
   */
  async deleteHighlight(userId: string, highlightId: string) {
    const highlight = await this.prisma.highlight.findUnique({
      where: { id: highlightId },
    });

    if (highlight?.userId !== userId) {
      throw new NotFoundException('Highlight not found');
    }

    return this.prisma.highlight.delete({
      where: { id: highlightId },
    });
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
    await this.verifyContentOwnership(userId, contentId);

    return this.aiService.generateExplanation({
      topic: sectionTitle,
      context: sectionContent,
    });
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
    await this.verifyContentOwnership(userId, contentId);

    return this.aiService.generateExample({
      topic: sectionTitle,
      context: sectionContent,
    });
  }

  // ==================== ANALYTICS ====================

  /**
   * Get popular topics across all users
   */
  async getPopularTopics() {
    const topics = await this.prisma.content.groupBy({
      by: ['topic'],
      _count: {
        topic: true,
      },
      orderBy: {
        _count: {
          topic: 'desc',
        },
      },
      take: 10,
    });

    return topics.map((t) => t.topic);
  }

  /**
   * Validate content generation request
   */
  private validateContentRequest(
    dto: { topic?: string; content?: string },
    files?: Express.Multer.File[]
  ): void {
    if (!dto.topic && !dto.content && (!files || files.length === 0)) {
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
   * Verify user exists
   */
  private async verifyUserExists(userId: string): Promise<void> {
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      throw new BadRequestException(
        `User with ID ${userId} not found. Please log in again.`
      );
    }
  }

  /**
   * Verify content ownership
   */
  private async verifyContentOwnership(
    userId: string,
    contentId: string
  ): Promise<void> {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { userId: true },
    });

    if (content?.userId !== userId) {
      throw new NotFoundException('Content not found');
    }
  }

  /**
   * Enhance content using AI
   */
  private async enhanceContentWithAI(originalContent: string): Promise<string> {
    try {
      const enhancedContent = await this.aiService.generateContent({
        prompt: `Enhance and structure the following study notes into a comprehensive study guide tailored for a Nigerian student. Keep the original meaning but improve clarity, structure, and add missing key details if obvious. Use Markdown formatting.
        
Original Notes:
${originalContent}`,
        maxTokens: AI_ENHANCEMENT_MAX_TOKENS,
      });

      return enhancedContent || originalContent;
    } catch (error) {
      this.logger.error('Failed to enhance content with AI:', error.stack);
      return originalContent; // Fallback to original
    }
  }

  /**
   * Generate learning guide asynchronously
   */
  private generateLearningGuideAsync(
    contentId: string,
    topic: string,
    content: string
  ): void {
    this.aiService
      .generateLearningGuide({
        topic,
        content: content.substring(0, MAX_LEARNING_GUIDE_LENGTH),
      })
      .then((learningGuide) => {
        return this.prisma.content.update({
          where: { id: contentId },
          data: { learningGuide },
        });
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to generate learning guide for ${contentId}:`,
          error.message
        );
      });
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
    const cacheKey = `content:all:${userId}`;
    await this.cacheManager.del(cacheKey);
  }
}
