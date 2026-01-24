import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { FlashcardSetSchema } from '../../langchain/schemas/flashcard.schema';
import { StudyPackService } from '../../study-pack/study-pack.service';
import { LangChainPrompts } from '../../langchain/prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { GenerateFlashcardDto } from '../dto/flashcard.dto';
import { FlashcardJobData, ProcessedFileData } from '../flashcard.processor';
import {
  JobContext,
  JobStrategy,
} from '../../common/queue/interfaces/job-strategy.interface';
import { InputPipeline } from '../../input-pipeline/input-pipeline.service';
import { InputSource } from '../../input-pipeline/input-source.interface';

export interface FlashcardContext extends JobContext<FlashcardJobData> {
  inputSources: InputSource[];
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
    private readonly inputPipeline: InputPipeline,
    private readonly studyPackService: StudyPackService
  ) {}

  async preProcess(job: Job<FlashcardJobData>): Promise<FlashcardContext> {
    const { userId, dto, files } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    // Use input pipeline to process all input sources
    const inputSources = await this.inputPipeline.process({
      ...dto,
      files,
      userId,
    });

    // Combine sources with precedence: FILE > CONTENT > TITLE
    const contentForAI = this.inputPipeline.combineInputSources(inputSources);

    return {
      userId,
      jobId,
      data: job.data,
      startTime: Date.now(),
      inputSources,
      contentForAI,
    };
  }

  async execute(context: FlashcardContext): Promise<any> {
    const { dto } = context.data;
    const { inputSources, contentForAI } = context;

    const startTime = Date.now();
    this.logger.log(
      `Job ${context.jobId}: Generating flashcards with ${inputSources.length} input source(s)`
    );

    const prompt = await LangChainPrompts.flashcardGeneration.format({
      cardCount: dto.numberOfCards.toString(),
      topic: dto.topic || '',
      sourceContentSection: LangChainPrompts.formatSourceContent(contentForAI),
    });

    const result = await this.langchainService.invokeWithStructure(
      FlashcardSetSchema,
      prompt,
      {
        task: 'flashcard',
        userId: context.userId,
        jobId: context.jobId,
      }
    );

    const latency = Date.now() - startTime;
    this.logger.log(
      `Job ${context.jobId}: Flashcard generation completed in ${latency}ms`
    );

    return result;
  }

  async postProcess(context: FlashcardContext, result: any): Promise<any> {
    const { userId, data } = context;
    const { dto, files } = data;
    const { cards, title, topic } = result;

    const sourceType = this.determineSourceType(dto, files);
    const cloudinaryUrls =
      files?.map((f) => f.cloudinaryUrl).filter(Boolean) || [];

    const flashcardSet = await this.prisma.flashcardSet.create({
      data: {
        title: title || dto.topic || null,
        topic: topic?.trim() || dto.topic?.trim() || null,
        cards: cards,
        userId,
        contentId: dto.contentId,
        sourceType,
        sourceFiles: cloudinaryUrls.length > 0 ? cloudinaryUrls : undefined,
        studyPackId: dto.studyPackId,
      },
    });

    if (dto.contentId) {
      await this.prisma.content.update({
        where: { id: dto.contentId },
        data: { flashcardSetId: flashcardSet.id },
      });
    }

    // Invalidate study pack cache if flashcard set is added to a study pack
    if (dto.studyPackId) {
      await this.studyPackService.invalidateUserCache(userId).catch(() => {});
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

  getQuotaType(_context: FlashcardContext): string {
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
}
