import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { FlashcardSetSchema } from '../../langchain/schemas/flashcard.schema';
import { UserDocumentService } from '../../user-document/user-document.service';
import { DocumentIngestionService } from '../../rag/document-ingestion.service';
import { AiPrompts } from '../../ai/ai.prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { GenerateFlashcardDto } from '../dto/flashcard.dto';
import { FlashcardJobData, ProcessedFileData } from '../flashcard.processor';
import {
  JobContext,
  JobStrategy,
} from '../../common/queue/interfaces/job-strategy.interface';

export interface FlashcardContext extends JobContext<FlashcardJobData> {
  fileReferences: any[];
  contentForAI: string;
}

@Injectable()
export class FlashcardGenerationStrategy implements JobStrategy<
  FlashcardJobData,
  any,
  FlashcardContext
> {
  private readonly logger = new Logger(FlashcardGenerationStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly userDocumentService: UserDocumentService,
    private readonly documentIngestionService: DocumentIngestionService
  ) {}

  async preProcess(job: Job<FlashcardJobData>): Promise<FlashcardContext> {
    const { userId, dto, files } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    // Prepare file references
    const fileReferences =
      files?.map((file) => ({
        googleFileUrl: file.googleFileUrl,
        googleFileId: file.googleFileId,
        originalname: file.originalname,
        mimetype: file.mimetype,
      })) || [];

    // Create UserDocument references for uploaded files
    if (files && files.length > 0) {
      await this.createUserDocumentReferences(userId, files, jobId);
    }

    const contentForAI = dto.content || '';

    return {
      userId,
      jobId,
      data: job.data,
      startTime: Date.now(),
      fileReferences,
      contentForAI,
    };
  }

  async execute(context: FlashcardContext): Promise<any> {
    const { dto } = context.data;
    const { fileReferences, contentForAI } = context;

    let sourceContent = contentForAI;

    if (fileReferences.length > 0) {
      const fileContents = await this.extractFileContents(fileReferences);
      sourceContent =
        fileContents + (contentForAI ? `\n\n${contentForAI}` : '');
    }

    this.logger.log(
      `Job ${context.jobId}: Generating flashcards with topic: "${dto.topic || 'N/A'}"`
    );

    const prompt = AiPrompts.generateFlashcards(
      dto.topic || '',
      dto.numberOfCards,
      sourceContent
    );

    const result = await this.langchainService.invokeWithStructure(
      FlashcardSetSchema,
      prompt,
      {
        task: 'flashcard',
        hasFiles: fileReferences.length > 0,
        complexity: 'simple',
      }
    );

    return result;
  }

  async postProcess(context: FlashcardContext, result: any): Promise<any> {
    const { userId, data } = context;
    const { dto, files } = data;
    const { cards, title, topic } = result;

    const sourceType = this.determineSourceType(dto, files);
    const googleFileUrls =
      files?.map((f) => f.googleFileUrl).filter(Boolean) || [];

    const flashcardSet = await this.prisma.flashcardSet.create({
      data: {
        title: title || dto.topic || 'Flashcard Set',
        topic: (topic || dto.topic || 'General').trim(),
        cards: cards as any,
        userId,
        contentId: dto.contentId,
        sourceType,
        sourceFiles: googleFileUrls.length > 0 ? googleFileUrls : undefined,
        studyPackId: dto.studyPackId,
      },
    });

    if (dto.contentId) {
      await this.prisma.content.update({
        where: { id: dto.contentId },
        data: { flashcardSetId: flashcardSet.id },
      });
    }

    return flashcardSet;
  }

  getEventData(context: FlashcardContext, result: any): any {
    return EventFactory.flashcardCompleted(
      context.userId,
      context.jobId,
      result.id,
      result.cards?.length || 0,
      {
        title: result.title,
      }
    );
  }

  getFailureData(context: FlashcardContext, error: Error): any {
    return EventFactory.flashcardFailed(
      context.userId,
      context.jobId,
      error.message
    );
  }

  getCachePatterns(context: FlashcardContext): string[] {
    const { userId } = context;
    return [`flashcards:all:${userId}*`, `flashcard:*:${userId}`];
  }

  getQuotaType(context: FlashcardContext): string {
    return 'flashcard';
  }

  getEventNames() {
    return {
      completed: EVENTS.FLASHCARD.COMPLETED,
      failed: EVENTS.FLASHCARD.FAILED,
    };
  }

  private determineSourceType(
    dto: GenerateFlashcardDto,
    files?: ProcessedFileData[]
  ): string {
    if (files && files.length > 0) return 'file';
    if (dto.content) return 'text';
    return 'topic';
  }

  private async extractFileContents(fileReferences: any[]): Promise<string> {
    const contents: string[] = [];
    for (const fileRef of fileReferences) {
      try {
        if (!fileRef.googleFileUrl) continue;
        const tempFile: Express.Multer.File = {
          fieldname: 'file',
          originalname: fileRef.originalname,
          encoding: '7bit',
          mimetype: fileRef.mimetype || 'application/octet-stream',
          size: 0,
          stream: null as any,
          destination: '',
          filename: fileRef.originalname,
          path: fileRef.googleFileUrl,
          buffer: Buffer.from(''),
        };
        const fileContent =
          await this.documentIngestionService.extractFileContent(tempFile);
        contents.push(
          `\n\n=== Content from ${fileRef.originalname} ===\n${fileContent}`
        );
      } catch (error) {
        this.logger.error(
          `Failed to extract content from ${fileRef.originalname}: ${error.message}`
        );
      }
    }
    return contents.join('\n\n');
  }

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
        }
      }
    } catch (error) {
      this.logger.warn(
        `Job ${jobId}: Failed to create UserDocument references: ${error.message}`
      );
    }
  }
}
