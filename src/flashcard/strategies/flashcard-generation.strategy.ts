import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { StudyPackService } from '../../study-pack/study-pack.service';
import { LangChainPrompts } from '../../langchain/prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { GenerateFlashcardDto } from '../dto/flashcard.dto';
import { FlashcardJobData, ProcessedFileData } from '../flashcard.processor';
import { JobContext, JobStrategy } from '../../common/queue/interfaces/job-strategy.interface';
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
    private readonly studyPackService: StudyPackService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('flashcard-generation') private readonly flashcardQueue: Queue
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
    const { contentForAI } = context;
    const { chunkIndex = 0, existingFlashcardSetId } = context.data;

    try {
      const startTime = Date.now();
      const totalRequested =
        context.data.totalCardsRequested || dto.numberOfCards;

      const existingCards = await this.getExistingCards(existingFlashcardSetId);
      const alreadyGeneratedCount = existingFlashcardSetId
        ? existingCards.length
        : (chunkIndex || 0) * 10;

      const remainingCount = totalRequested - alreadyGeneratedCount;
      const currentChunkSize = Math.min(10, remainingCount);

      if (currentChunkSize <= 0) {
        this.logger.log(
          `Job ${context.jobId}: All flashcards generated (${alreadyGeneratedCount}/${totalRequested}). Stopping.`
        );
        return { cards: [], title: dto.topic, topic: dto.topic };
      }

      if (chunkIndex > 10) {
        this.logger.warn(
          `Job ${context.jobId}: Max chunk index reached (10). Force stopping generation.`
        );
        return { cards: [], title: dto.topic, topic: dto.topic };
      }

      this.logger.log(
        `Job ${context.jobId}: Generating flashcard chunk ${chunkIndex + 1} for set ${existingFlashcardSetId || 'NEW'}. ` +
          `Current cards: ${alreadyGeneratedCount}/${totalRequested}. Requesting ${currentChunkSize} more.`
      );

      const previousCards =
        chunkIndex > 0 ? existingCards.map((c: any) => c.front) : [];

      const prompt = LangChainPrompts.generateFlashcards(
        dto.topic || '',
        currentChunkSize,
        contentForAI || '',
        previousCards
      );

      const result = await this.langchainService.invokeWithJsonParser(prompt, {
        task: 'flashcard',
        userId: context.userId,
        jobId: context.jobId,
      });

      const latency = Date.now() - startTime;
      this.logger.log(
        `Job ${context.jobId}: Flashcard chunk generation completed in ${latency}ms`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Job ${context.jobId}: Flashcard generation failed: ${error.message}`
      );

      throw new Error(
        error.message?.includes('timeout') ||
          error.message?.includes('timed out')
          ? 'Flashcard generation timed out. Please try with a shorter topic or less content.'
          : 'Failed to generate flashcards. Please try again.'
      );
    }
  }

  private async getExistingCards(setId?: string): Promise<any[]> {
    if (!setId) return [];
    const set = await this.prisma.flashcardSet.findUnique({
      where: { id: setId },
      select: { cards: true },
    });
    return set && Array.isArray(set.cards) ? set.cards : [];
  }

  async postProcess(context: FlashcardContext, result: any): Promise<any> {
    const { data } = context;
    const { chunkIndex = 0, existingFlashcardSetId } = data;

    if (chunkIndex === 0 && !existingFlashcardSetId) {
      return this.handleInitialChunk(context, result);
    } else if (existingFlashcardSetId) {
      return this.handleBackgroundChunk(context, result);
    }

    return null;
  }

  private async handleInitialChunk(
    context: FlashcardContext,
    result: any
  ): Promise<any> {
    const { userId, data } = context;
    const { dto, files } = data;
    const { cards, title, topic } = result;

    const totalRequested = data.totalCardsRequested || dto.numberOfCards;
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
        totalCardsRequested: totalRequested,
      },
    });

    if (dto.contentId) {
      await this.prisma.content.update({
        where: { id: dto.contentId },
        data: { flashcardSetId: flashcardSet.id },
      });
    }

    if (dto.studyPackId) {
      await this.studyPackService.invalidateUserCache(userId).catch(() => {});
    }

    if (totalRequested > cards.length) {
      this.logger.log(
        `Job ${context.jobId}: Initial flashcard chunk done (${cards.length} cards). Queueing next chunks for set ${flashcardSet.id} to reach target of ${totalRequested}`
      );
      await this.queueNextChunk(context, flashcardSet.id, 1, totalRequested);
    } else {
      this.logger.log(
        `Job ${context.jobId}: All ${cards.length} flashcards generated in the initial chunk. target was ${totalRequested}.`
      );
    }

    return flashcardSet;
  }

  private async handleBackgroundChunk(
    context: FlashcardContext,
    result: any
  ): Promise<any> {
    const { userId, data } = context;
    const { existingFlashcardSetId, chunkIndex = 0 } = data;
    const { cards } = result;

    const existingSet = await this.prisma.flashcardSet.findUnique({
      where: { id: existingFlashcardSetId },
      select: { cards: true, totalCardsRequested: true },
    });

    if (!existingSet) {
      throw new Error(
        `Existing flashcard set ${existingFlashcardSetId} not found`
      );
    }

    const totalRequested =
      existingSet.totalCardsRequested || data.totalCardsRequested;
    const updatedCards = [...(existingSet.cards as any[]), ...cards];

    const updatedSet = await this.prisma.flashcardSet.update({
      where: { id: existingFlashcardSetId },
      data: { cards: updatedCards },
    });

    this.logger.log(
      `Job ${context.jobId}: Updated flashcard set ${existingFlashcardSetId} with chunk ${chunkIndex + 1}. Total cards: ${updatedCards.length}/${totalRequested}`
    );

    this.emitProgress(
      userId,
      context.jobId,
      existingFlashcardSetId,
      cards.length,
      updatedCards.length,
      totalRequested
    );

    if (
      totalRequested > updatedCards.length &&
      cards.length > 0 &&
      chunkIndex < 10
    ) {
      this.logger.log(
        `Job ${context.jobId}: Queueing next chunk (${chunkIndex + 2}) for set ${existingFlashcardSetId}. Progress: ${updatedCards.length}/${totalRequested}`
      );
      await this.queueNextChunk(
        context,
        existingFlashcardSetId,
        chunkIndex + 1,
        totalRequested
      );
    } else if (totalRequested > updatedCards.length && cards.length === 0) {
      this.logger.warn(
        `Job ${context.jobId}: No new flashcards added in chunk ${chunkIndex + 1}. Stopping generation flow to avoid infinite loop.`
      );
    } else if (updatedCards.length >= totalRequested) {
      this.logger.log(
        `Job ${context.jobId}: Target reached (${updatedCards.length}/${totalRequested}). Generation completed.`
      );
    }

    return updatedSet;
  }

  private emitProgress(
    userId: string,
    jobId: string,
    flashcardSetId: string,
    _added: number,
    current: number,
    total: number
  ): void {
    this.eventEmitter.emit(
      EVENTS.FLASHCARD.PROGRESS,
      EventFactory.flashcardProgress(
        userId,
        jobId,
        'chunk-completed',
        Math.round((current / total) * 100),
        `Generated ${current} of ${total} flashcards`,
        { flashcardSetId }
      )
    );
  }

  private async queueNextChunk(
    context: FlashcardContext,
    setId: string,
    nextChunkIndex: number,
    totalRequested: number
  ): Promise<void> {
    const { data } = context;
    await this.flashcardQueue.add(
      'generate-remaining-chunks',
      {
        ...data,
        existingFlashcardSetId: setId,
        chunkIndex: nextChunkIndex,
        totalCardsRequested: totalRequested,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
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
