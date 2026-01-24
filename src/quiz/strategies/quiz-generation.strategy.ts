import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { QuizGenerationSchema } from '../../langchain/schemas/quiz.schema';
import { StudyPackService } from '../../study-pack/study-pack.service';
import { LangChainPrompts } from '../../langchain/prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { QuizType } from '@prisma/client';
import { GenerateQuizDto } from '../dto/quiz.dto';
import { QuizUtils } from '../quiz.utils';
import { FileReference, QuizJobData } from '../quiz.processor';
import {
  JobContext,
  JobStrategy,
} from '../../common/queue/interfaces/job-strategy.interface';
import { InputPipeline } from '../../input-pipeline/input-pipeline.service';
import {
  InputSource,
  InputSourceType,
} from '../../input-pipeline/input-source.interface';

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
    private readonly studyPackService: StudyPackService
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
    const { inputSources, contentForAI } = context;

    this.logger.log(
      `Job ${context.jobId}: Generating quiz with ${inputSources.length} input source(s)`
    );

    const prompt = await this.buildQuizPrompt(dto, contentForAI);

    const result = await this.langchainService.invokeWithStructure(
      QuizGenerationSchema,
      prompt,
      {
        task: 'quiz',
        hasFiles: inputSources.some((s) => s.type === InputSourceType.FILE),
        complexity: dto.difficulty === 'hard' ? 'complex' : 'simple',
      }
    );

    const questions = QuizUtils.normalizeQuestions(result.questions);
    const title = result.title || dto.topic || 'Untitled Quiz';
    const topic = result.topic || dto.topic || null;

    return { questions, title, topic };
  }

  async postProcess(context: QuizContext, result: any): Promise<any> {
    const { userId, data } = context;
    const { dto, contentId, files } = data;
    const { questions, title, topic } = result;

    const quizType = this.mapQuizType(dto.quizType);
    const sourceType = this.determineSourceType(dto, files);
    const sourceFiles = this.extractFileUrls(files);

    const quiz = await this.prisma.quiz.create({
      data: {
        title: title,
        topic: topic?.trim() || null,
        difficulty: dto.difficulty,
        quizType,
        timeLimit: dto.timeLimit,
        questions: questions,
        userId,
        sourceType,
        sourceFiles,
        contentId,
        studyPackId: dto.studyPackId,
      },
    });

    if (contentId) {
      await this.linkToContent(contentId, quiz.id);
    }

    // Invalidate study pack cache if quiz is added to a study pack
    if (dto.studyPackId) {
      await this.studyPackService.invalidateUserCache(userId).catch(() => {});
    }

    return quiz;
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

  private async buildQuizPrompt(
    dto: GenerateQuizDto,
    content: string | undefined
  ): Promise<string> {
    const questionTypes =
      dto.questionTypes && dto.questionTypes.length > 0
        ? dto.questionTypes.join(', ')
        : 'single-select, true-false, fill-blank';

    return await LangChainPrompts.quizGeneration.format({
      difficulty: dto.difficulty || 'Medium',
      topic: dto.topic || '', // No default
      sourceContentSection: LangChainPrompts.formatSourceContent(content),
      questionCount: dto.numberOfQuestions.toString(),
      questionTypes: `${dto.quizType || 'standard'} - ${questionTypes}`,
      focusAreas: LangChainPrompts.formatFocusAreas(),
    });
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
