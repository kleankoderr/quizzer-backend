import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LangChainService } from '../../langchain/langchain.service';
import { QuizGenerationSchema } from '../../langchain/schemas/quiz.schema';
import { UserDocumentService } from '../../user-document/user-document.service';
import { DocumentIngestionService } from '../../rag/document-ingestion.service';
import { StudyPackService } from '../../study-pack/study-pack.service';
import { AiPrompts } from '../../ai/ai.prompts';
import { EVENTS } from '../../events/events.constants';
import { EventFactory } from '../../events/events.types';
import { QuizType } from '@prisma/client';
import { GenerateQuizDto } from '../dto/quiz.dto';
import { FileReference, QuizJobData } from '../quiz.processor';
import {
  JobContext,
  JobStrategy,
} from '../../common/queue/interfaces/job-strategy.interface';

const QUIZ_TYPE_MAP: Record<string, QuizType> = {
  standard: QuizType.STANDARD,
  timed: QuizType.TIMED_TEST,
  scenario: QuizType.SCENARIO_BASED,
};

export interface QuizContext extends JobContext<QuizJobData> {
  fileReferences: FileReference[];
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
    private readonly userDocumentService: UserDocumentService,
    private readonly documentIngestionService: DocumentIngestionService,
    private readonly studyPackService: StudyPackService
  ) {}

  async preProcess(job: Job<QuizJobData>): Promise<QuizContext> {
    const { userId, dto, contentId, files } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    const fileReferences = this.prepareFileReferences(files);

    if (files && files.length > 0) {
      await this.createUserDocumentReferences(userId, files, jobId);
    }

    let contentForAI = dto.content || '';
    if (contentId) {
      contentForAI = await this.fetchContentWithLearningGuide(contentId);
    }

    return {
      userId,
      jobId,
      data: job.data,
      startTime: Date.now(),
      fileReferences,
      contentForAI,
    };
  }

  async execute(context: QuizContext): Promise<any> {
    const { dto } = context.data;
    const { fileReferences, contentForAI } = context;

    let sourceContent = contentForAI;

    if (fileReferences.length > 0) {
      const fileContents = await this.extractFileContents(fileReferences);
      sourceContent =
        fileContents + (contentForAI ? `\n\n${contentForAI}` : '');
    }

    const prompt = this.buildQuizPrompt(dto, sourceContent);

    const result = await this.langchainService.invokeWithStructure(
      QuizGenerationSchema,
      prompt,
      {
        task: 'quiz',
        hasFiles: fileReferences.length > 0,
        complexity: dto.difficulty === 'hard' ? 'complex' : 'simple',
      }
    );

    const questions = this.shuffleQuestions(result.questions);
    const title = result.title || dto.topic || 'Quiz';
    const topic = result.topic || dto.topic || 'General';

    return { questions, title: title.trim(), topic: topic.trim() };
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
        title,
        topic: topic.trim(),
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

  // Helper methods moved from QuizProcessor

  private prepareFileReferences(files?: FileReference[]): FileReference[] {
    if (!files || files.length === 0) return [];
    return files.map((file) => ({
      cloudinaryUrl: file.cloudinaryUrl,
      cloudinaryId: file.cloudinaryId,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    }));
  }

  private async extractFileContents(
    fileReferences: FileReference[]
  ): Promise<string> {
    const contents: string[] = [];
    for (const fileRef of fileReferences) {
      try {
        if (!fileRef.cloudinaryUrl) continue;
        const tempFile: any = {
          originalname: fileRef.originalname,
          mimetype: fileRef.mimetype || 'application/octet-stream',
          size: fileRef.size || 0,
          path: fileRef.cloudinaryUrl,
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

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private shuffleQuestions(questions: any[]): any[] {
    return this.shuffleArray(questions).map((q) => {
      if (q.questionType === 'matching') {
        // Transform correctAnswer from array of {key, value} to Record if needed (for Gemini workaround)
        if (Array.isArray(q.correctAnswer)) {
          q.correctAnswer = q.correctAnswer.reduce(
            (acc: Record<string, string>, pair: any) => {
              acc[pair.key] = pair.value;
              return acc;
            },
            {}
          );
        }

        if (q.leftColumn && q.rightColumn) {
          return {
            ...q,
            leftColumn: this.shuffleArray(q.leftColumn),
            rightColumn: this.shuffleArray(q.rightColumn),
          };
        }
      }
      return q;
    });
  }

  private buildQuizPrompt(
    dto: GenerateQuizDto,
    content: string | undefined
  ): string {
    const questionTypes =
      dto.questionTypes && dto.questionTypes.length > 0
        ? dto.questionTypes.join(', ')
        : 'Mix of multiple choice, true/false, and fill-in-the-blank';

    return AiPrompts.generateQuiz(
      dto.topic || '',
      dto.numberOfQuestions,
      dto.difficulty || 'medium',
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

  private async createUserDocumentReferences(
    userId: string,
    files: FileReference[],
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
