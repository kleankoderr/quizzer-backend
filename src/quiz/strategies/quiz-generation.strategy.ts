import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { StudyPackService } from '../../study-pack/study-pack.service';
import { CacheService } from '../../common/services/cache.service';
import { LangChainPrompts } from '../../langchain/prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { ContentScope, QuizType } from '@prisma/client';
import { GenerateQuizDto } from '../dto/quiz.dto';
import { QuizUtils } from '../quiz.utils';
import { FileReference, QuizJobData } from '../quiz.processor';
import { JobContext, JobStrategy } from '../../common/queue/interfaces/job-strategy.interface';
import { InputPipeline } from '../../input-pipeline/input-pipeline.service';
import { InputSource } from '../../input-pipeline/input-source.interface';

const QUIZ_TYPE_MAP: Record<string, QuizType> = {
  standard: QuizType.STANDARD,
  timed: QuizType.TIMED_TEST,
  scenario: QuizType.SCENARIO_BASED,
};

export interface QuizContext extends JobContext<QuizJobData> {
  inputSources: InputSource[];
  contentForAI: string;
}

@Injectable()
export class QuizGenerationStrategy implements JobStrategy<
  QuizJobData,
  any,
  QuizContext
> {
  private readonly logger = new Logger(QuizGenerationStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly inputPipeline: InputPipeline,
    private readonly studyPackService: StudyPackService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
    @InjectQueue('quiz-generation') private readonly quizQueue: Queue
  ) {}

  async preProcess(job: Job<QuizJobData>): Promise<QuizContext> {
    const { userId, dto, contentId, files } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    // Fetch content from existing study material if contentId provided
    let additionalContent = '';
    if (contentId) {
      additionalContent = await this.fetchContentWithLearningGuide(contentId);
    }

    // Use input pipeline to process all input sources
    const inputSources = await this.inputPipeline.process({
      ...dto,
      content: dto.content || additionalContent,
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

  async execute(context: QuizContext): Promise<any> {
    const { dto } = context.data;
    const { contentForAI } = context;
    const { chunkIndex = 0, existingQuizId } = context.data;

    try {
      const startTime = Date.now();
      const totalRequested =
        context.data.totalQuestionsRequested || dto.numberOfQuestions;

      const existingQuestions = await this.getExistingQuestions(existingQuizId);
      const alreadyGeneratedCount = existingQuizId
        ? existingQuestions.length
        : (chunkIndex || 0) * 5;

      const remainingCount = totalRequested - alreadyGeneratedCount;
      const currentChunkSize = Math.min(5, remainingCount);

      if (currentChunkSize <= 0) {
        this.logger.log(
          `Job ${context.jobId}: All questions generated (${alreadyGeneratedCount}/${totalRequested}). Stopping.`
        );
        return { questions: [], title: dto.topic, topic: dto.topic };
      }

      if (chunkIndex > 10) {
        this.logger.warn(
          `Job ${context.jobId}: Max chunk index reached (10). Force stopping generation.`
        );
        return { questions: [], title: dto.topic, topic: dto.topic };
      }

      this.logger.log(
        `Job ${context.jobId}: Generating quiz chunk ${chunkIndex + 1} (${currentChunkSize} questions) for quiz ${existingQuizId || 'NEW'}`
      );

      const previousQuestions =
        chunkIndex > 0 ? existingQuestions.map((q: any) => q.question) : [];

      const prompt = await this.buildChunkPrompt(
        dto,
        contentForAI,
        currentChunkSize,
        previousQuestions
      );

      const result = await this.langchainService.invokeWithJsonParser(prompt, {
        task: 'quiz',
        userId: context.userId,
        jobId: context.jobId,
      });

      // Validate structure and content
      if (!this.validateQuizResult(result)) {
        this.logger.warn(
          `Job ${context.jobId}: Quiz chunk returned empty questions`
        );

        throw new Error(
          'Generated quiz chunk has no questions. Please try again with different content.'
        );
      }

      const latency = Date.now() - startTime;
      this.logger.log(
        `Job ${context.jobId}: Quiz chunk generation completed in ${latency}ms`
      );

      const questions = QuizUtils.normalizeQuestions(result.questions);
      const title = result.title || dto.topic || 'Untitled Quiz';
      const topic = result.topic || dto.topic || null;

      return { questions, title, topic };
    } catch (error) {
      this.logger.error(
        `Job ${context.jobId}: Quiz generation failed: ${error.message}`
      );

      throw new Error(
        error.message?.includes('timeout') ||
          error.message?.includes('timed out')
          ? 'Quiz generation timed out. Please try with a shorter topic or less content.'
          : 'Failed to generate quiz. Please try again.'
      );
    }
  }

  private validateQuizResult(result: any): boolean {
    if (!result?.questions || !Array.isArray(result.questions)) return false;
    return result.questions.length !== 0;
  }

  private async getExistingQuestions(quizId?: string): Promise<any[]> {
    if (!quizId) return [];
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { questions: true },
    });
    return quiz && Array.isArray(quiz.questions) ? quiz.questions : [];
  }

  async postProcess(context: QuizContext, result: any): Promise<any> {
    const { data } = context;
    const { chunkIndex = 0, existingQuizId } = data;

    if (chunkIndex === 0 && !existingQuizId) {
      return this.handleInitialChunk(context, result);
    } else if (existingQuizId) {
      return this.handleBackgroundChunk(context, result);
    }

    return null;
  }

  private async handleInitialChunk(
    context: QuizContext,
    result: any
  ): Promise<any> {
    const { userId, data } = context;
    const { dto, contentId, files, adminContext } = data;
    const { questions, title, topic } = result;

    const totalRequested =
      data.totalQuestionsRequested || dto.numberOfQuestions;
    const quizType = this.mapQuizType(dto.quizType);
    const sourceType = this.determineSourceType(dto, files);
    const sourceFiles = this.extractFileUrls(files);

    const quiz = await this.prisma.quiz.create({
      data: {
        title,
        topic: topic?.trim() || null,
        difficulty: dto.difficulty,
        quizType,
        timeLimit: dto.timeLimit,
        questions,
        userId,
        sourceType,
        sourceFiles,
        contentId,
        studyPackId: dto.studyPackId,
        totalQuestionsRequested: totalRequested,
      },
    });

    if (contentId) {
      await this.linkToContent(contentId, quiz.id);
    }

    if (dto.studyPackId) {
      await this.studyPackService.invalidateUserCache(userId).catch(() => {});
    }

    if (adminContext) {
      await this.createAdminQuiz(quiz.id, userId, adminContext);
    }

    if (totalRequested > questions.length) {
      this.logger.log(
        `Job ${context.jobId}: Initial chunk done. Queueing next chunks for quiz ${quiz.id}`
      );
      await this.queueNextChunk(context, quiz.id, 1, totalRequested);
    }

    return quiz;
  }

  private async handleBackgroundChunk(
    context: QuizContext,
    result: any
  ): Promise<any> {
    const { userId, data } = context;
    const { existingQuizId, chunkIndex = 0 } = data;
    const { questions } = result;

    const existingQuiz = await this.prisma.quiz.findUnique({
      where: { id: existingQuizId },
      select: { questions: true, totalQuestionsRequested: true },
    });

    if (!existingQuiz) {
      throw new Error(`Existing quiz ${existingQuizId} not found`);
    }

    const totalRequested =
      existingQuiz.totalQuestionsRequested || data.totalQuestionsRequested;
    const updatedQuestions = [
      ...(existingQuiz.questions as any[]),
      ...questions,
    ];

    const updatedQuiz = await this.prisma.quiz.update({
      where: { id: existingQuizId },
      data: { questions: updatedQuestions },
    });

    this.logger.log(
      `Job ${context.jobId}: Updated quiz ${existingQuizId} with chunk ${chunkIndex + 1}. Total questions: ${updatedQuestions.length}/${totalRequested}`
    );

    this.emitProgress(
      userId,
      context.jobId,
      existingQuizId,
      questions.length,
      updatedQuestions.length,
      totalRequested
    );

    await this.invalidateQuizCache(existingQuizId, userId);

    if (
      totalRequested > updatedQuestions.length &&
      questions.length > 0 &&
      chunkIndex < 10
    ) {
      await this.queueNextChunk(
        context,
        existingQuizId,
        chunkIndex + 1,
        totalRequested
      );
    } else if (
      totalRequested > updatedQuestions.length &&
      questions.length === 0
    ) {
      this.logger.warn(
        `Job ${context.jobId}: No new questions added in chunk ${chunkIndex + 1}. Stopping.`
      );
    }

    return updatedQuiz;
  }

  private async createAdminQuiz(
    quizId: string,
    userId: string,
    adminContext: any
  ): Promise<void> {
    this.logger.log(`Creating AdminQuiz for quiz ${quizId}`);
    await this.prisma.adminQuiz.create({
      data: {
        quizId,
        createdBy: userId,
        scope:
          adminContext.scope === 'GLOBAL'
            ? ContentScope.GLOBAL
            : ContentScope.SCHOOL,
        schoolId: adminContext.schoolId,
        isActive: adminContext.isActive ?? true,
        publishedAt: adminContext.publishedAt,
      },
    });
  }

  private emitProgress(
    userId: string,
    jobId: string,
    quizId: string,
    added: number,
    current: number,
    total: number
  ): void {
    this.eventEmitter.emit(
      EVENTS.QUIZ.PROGRESS,
      EventFactory.quizProgress(
        userId,
        jobId,
        'chunk-completed',
        Math.round((current / total) * 100),
        `Generated ${current} of ${total} questions`,
        {
          quizId,
          questionsAdded: added,
          currentCount: current,
          totalCount: total,
        }
      )
    );
  }

  private async invalidateQuizCache(
    quizId: string,
    userId: string
  ): Promise<void> {
    await Promise.all([
      this.cacheService.invalidateByPattern(`quiz:${quizId}:*`),
      this.cacheService.invalidate(`quiz:${quizId}:${userId}`),
    ]).catch(() => {});
  }

  private async queueNextChunk(
    context: QuizContext,
    quizId: string,
    nextChunkIndex: number,
    totalRequested: number
  ): Promise<void> {
    const { data } = context;
    await this.quizQueue.add(
      'generate-remaining-chunks',
      {
        ...data,
        existingQuizId: quizId,
        chunkIndex: nextChunkIndex,
        totalQuestionsRequested: totalRequested,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  }

  protected async buildChunkPrompt(
    dto: GenerateQuizDto,
    content: string | undefined,
    chunkSize: number,
    previousQuestions: string[] = []
  ): Promise<string> {
    const questionTypes =
      dto.questionTypes && dto.questionTypes.length > 0
        ? dto.questionTypes.join(', ')
        : 'single-select, true-false, fill-blank';

    return LangChainPrompts.generateQuiz(
      dto.topic || '',
      chunkSize,
      dto.difficulty || 'Medium',
      dto.quizType || QuizType.STANDARD,
      questionTypes,
      content || '',
      previousQuestions
    );
  }

  getEventData(context: QuizContext, result: any): any {
    return EventFactory.quizCompleted(
      context.userId,
      context.jobId,
      result.id,
      result.questions?.length || 0,
      {
        title: result.title,
        topic: result.topic,
      }
    );
  }

  getFailureData(context: QuizContext, error: Error): any {
    return EventFactory.quizFailed(
      context.userId,
      context.jobId,
      error.message
    );
  }

  getCachePatterns(context: QuizContext): string[] {
    const { userId } = context;
    return [`quizzes:all:${userId}*`, `quiz:*:${userId}`];
  }

  getQuotaType(_context: QuizContext): string {
    return 'quiz';
  }

  getEventNames() {
    return {
      completed: EVENTS.QUIZ.COMPLETED,
      failed: EVENTS.QUIZ.FAILED,
    };
  }

  protected async buildQuizPrompt(
    dto: GenerateQuizDto,
    content: string | undefined
  ): Promise<string> {
    const questionTypes =
      dto.questionTypes && dto.questionTypes.length > 0
        ? dto.questionTypes.join(', ')
        : 'single-select, true-false, fill-blank';

    return LangChainPrompts.generateQuiz(
      dto.topic || '',
      dto.numberOfQuestions,
      dto.difficulty || 'Medium',
      dto.quizType || 'standard',
      questionTypes,
      content || ''
    );
  }

  private mapQuizType(quizType?: string): QuizType {
    if (!quizType) return QuizType.STANDARD;
    return QUIZ_TYPE_MAP[quizType.toLowerCase()] || QuizType.STANDARD;
  }

  private determineSourceType(
    dto: GenerateQuizDto,
    files?: FileReference[]
  ): string {
    if (files && files.length > 0) return 'file';
    if (dto.content) return 'text';
    return 'topic';
  }

  private extractFileUrls(files?: FileReference[]): string[] {
    if (!files || files.length === 0) return [];
    return files.map((f) => f.cloudinaryUrl).filter(Boolean);
  }

  private async linkToContent(
    contentId: string,
    quizId: string
  ): Promise<void> {
    try {
      await this.prisma.content.update({
        where: { id: contentId },
        data: { quizId },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to link quiz ${quizId} to content ${contentId}: ${error.message}`
      );
    }
  }

  private async fetchContentWithLearningGuide(
    contentId: string
  ): Promise<string> {
    try {
      const content = await this.prisma.content.findUnique({
        where: { id: contentId },
        select: { content: true, learningGuide: true },
      });
      if (!content) return '';
      let combinedContent = content.content;
      if (content.learningGuide) {
        const learningGuide = content.learningGuide as any;
        if (learningGuide.sections && Array.isArray(learningGuide.sections)) {
          const sectionsText = learningGuide.sections
            .map((section: any) => {
              let sectionContent = `\n\n## ${section.title}\n${section.content}`;
              if (section.examples && section.examples.length > 0) {
                sectionContent +=
                  '\n\n### Examples:\n' + section.examples.join('\n\n');
              }
              if (section.explanation) {
                sectionContent += `\n\n### Explanation:\n${section.explanation}`;
              }
              return sectionContent;
            })
            .join('\n');
          combinedContent += `\n\n# Learning Guide\n${sectionsText}`;
        }
      }
      return combinedContent;
    } catch (error) {
      this.logger.error(
        `Failed to fetch content ${contentId}: ${error.message}`
      );
      return '';
    }
  }
}
