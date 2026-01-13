import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { QuizGenerationSchema } from '../langchain/schemas/quiz.schema';
import { CacheService } from '../common/services/cache.service';
import { GenerateQuizDto } from './dto/quiz.dto';
import { QuizType } from '@prisma/client';
import { EventFactory } from '../events/events.types';
import { EVENTS } from '../events/events.constants';
import { UserDocumentService } from '../user-document/user-document.service';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { AiPrompts } from '../ai/ai.prompts';
import { DocumentIngestionService } from '../rag/document-ingestion.service';

export interface FileReference {
  originalname: string;
  cloudinaryUrl?: string;
  cloudinaryId?: string;
  googleFileUrl?: string;
  googleFileId?: string;
  mimetype?: string;
  documentId?: string;
}

export interface QuizJobData {
  userId: string;
  dto: GenerateQuizDto;
  contentId?: string;
  files?: FileReference[];
}

const QUIZ_TYPE_MAP: Record<string, QuizType> = {
  standard: QuizType.STANDARD,
  timed: QuizType.TIMED_TEST,
  scenario: QuizType.SCENARIO_BASED,
};

@Processor('quiz-generation')
export class QuizProcessor extends WorkerHost {
  private readonly logger = new Logger(QuizProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userDocumentService: UserDocumentService,
    private readonly quotaService: QuotaService,
    private readonly studyPackService: StudyPackService,
    private readonly cacheService: CacheService,
    private readonly documentIngestionService: DocumentIngestionService
  ) {
    super();
  }

  async process(job: Job<QuizJobData>): Promise<any> {
    const { userId, dto, contentId, files } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    this.logger.log(
      `Processing quiz generation job ${jobId} for user ${userId}`
    );

    try {
      const fileReferences = this.prepareFileReferences(files);

      if (files && files.length > 0) {
        await this.createUserDocumentReferences(userId, files, jobId);
      }

      let contentForAI = dto.content;
      if (contentId) {
        const fetchedContent =
          await this.fetchContentWithLearningGuide(contentId);
        contentForAI = fetchedContent;
        this.logger.log(
          `Job ${jobId}: Fetched content and learning guide for contentId ${contentId}`
        );
      }

      const { questions, title, topic } = await this.generateQuizWithAI(
        dto,
        contentForAI,
        fileReferences
      );

      const shuffledQuestions = this.shuffleQuestions(questions);

      this.logger.log(
        `Job ${jobId}: Generated ${shuffledQuestions.length} question(s)`
      );

      const quiz = await this.saveQuiz(
        userId,
        dto,
        contentId,
        title,
        topic,
        shuffledQuestions,
        files
      );

      if (contentId) {
        await this.linkToContent(contentId, quiz.id);
      }

      await this.quotaService.incrementQuota(userId, 'quiz');

      await Promise.all([
        this.studyPackService.invalidateUserCache(userId),
        this.cacheService.invalidateByPattern(`quizzes:all:${userId}*`),
        this.cacheService.invalidateByPattern(`quiz:*:${userId}`),
      ]);

      await job.updateProgress(100);

      this.logger.log(
        `Job ${jobId}: Successfully completed (Quiz ID: ${quiz.id})`
      );

      // Emit completion event
      this.eventEmitter.emit(
        EVENTS.QUIZ.COMPLETED,
        EventFactory.quizCompleted(userId, jobId, quiz.id, questions.length, {
          title: quiz.title,
          topic: quiz.topic,
        })
      );

      return {
        success: true,
        id: quiz.id,
      };
    } catch (error) {
      this.logger.error(`Job ${jobId}: Failed to generate quiz`, error.stack);

      // Emit failure event
      this.eventEmitter.emit(
        EVENTS.QUIZ.FAILED,
        EventFactory.quizFailed(userId, jobId, error.message)
      );

      throw error;
    }
  }

  private prepareFileReferences(files?: FileReference[]): FileReference[] {
    if (!files || files.length === 0) {
      return [];
    }

    const fileRefs = files.map((file) => ({
      googleFileUrl: file.googleFileUrl,
      googleFileId: file.googleFileId,
      originalname: file.originalname,
      mimetype: file.mimetype,
    }));

    this.logger.debug(`Using ${fileRefs.length} pre-uploaded file(s)`);
    return fileRefs;
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
      if (q.questionType === 'matching' && q.leftColumn && q.rightColumn) {
        return {
          ...q,
          leftColumn: this.shuffleArray(q.leftColumn),
          rightColumn: this.shuffleArray(q.rightColumn),
        };
      }
      return q;
    });
  }

  private async generateQuizWithAI(
    dto: GenerateQuizDto,
    content: string | undefined,
    fileReferences: FileReference[]
  ) {
    let sourceContent = content || '';

    if (fileReferences.length > 0) {
      const fileContents = await this.extractFileContents(fileReferences);
      sourceContent = fileContents + (content ? `\n\n${content}` : '');
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

    const questions = result.questions;
    const title = dto.topic || 'Quiz';
    const topic = dto.topic || 'General';

    return { questions, title, topic };
  }

  private async extractFileContents(
    fileReferences: FileReference[]
  ): Promise<string> {
    const contents: string[] = [];

    for (const fileRef of fileReferences) {
      try {
        if (!fileRef.googleFileUrl) {
          this.logger.warn(
            `Skipping file ${fileRef.originalname}: no file URL`
          );
          continue;
        }

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

  /**
   * Build quiz generation prompt
   */
  private buildQuizPrompt(
    dto: GenerateQuizDto,
    content: string | undefined
  ): string {
    const questionTypeInstructions = this.buildQuestionTypeInstructions(
      dto.questionTypes
    );

    return AiPrompts.generateQuiz(
      dto.topic || '',
      dto.numberOfQuestions,
      dto.difficulty || 'medium',
      dto.quizType || 'standard',
      questionTypeInstructions,
      content || ''
    );
  }

  private buildQuestionTypeInstructions(questionTypes?: string[]): string {
    if (!questionTypes || questionTypes.length === 0) {
      return 'Mix of multiple choice, true/false, and fill-in-the-blank';
    }
    return questionTypes.join(', ');
  }

  /**
   * Save quiz to database
   */
  private async saveQuiz(
    userId: string,
    dto: GenerateQuizDto,
    contentId: string | undefined,
    title: string,
    topic: string,
    questions: any[],
    files?: FileReference[]
  ) {
    const quizType = this.mapQuizType(dto.quizType);
    const sourceType = this.determineSourceType(dto, files);
    const sourceFiles = this.extractFileUrls(files);

    return this.prisma.quiz.create({
      data: {
        title,
        topic: topic.trim(),
        difficulty: dto.difficulty,
        quizType,
        timeLimit: dto.timeLimit,
        questions: questions as any,
        userId,
        sourceType,
        sourceFiles,
        contentId,
        studyPackId: dto.studyPackId,
      },
    });
  }

  /**
   * Map quiz type string to Prisma enum
   */
  private mapQuizType(quizType?: string): QuizType {
    if (!quizType) {
      return QuizType.STANDARD;
    }

    return QUIZ_TYPE_MAP[quizType.toLowerCase()] || QuizType.STANDARD;
  }

  /**
   * Determine source type based on input
   */
  private determineSourceType(
    dto: GenerateQuizDto,
    files?: FileReference[]
  ): string {
    if (files && files.length > 0) return 'file';
    if (dto.content) return 'text';
    return 'topic';
  }

  /**
   * Extract file URLs from file references
   */
  private extractFileUrls(files?: FileReference[]): string[] {
    if (!files || files.length === 0) {
      return [];
    }

    return files.map((f) => f.googleFileUrl).filter(Boolean);
  }

  /**
   * Link quiz to content
   */
  private async linkToContent(
    contentId: string,
    quizId: string
  ): Promise<void> {
    try {
      await this.prisma.content.update({
        where: { id: contentId },
        data: { quizId },
      });
      this.logger.debug(`Linked quiz ${quizId} to content ${contentId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to link quiz ${quizId} to content ${contentId}:`,
        error.message
      );
    }
  }

  /**
   * Fetch content and learning guide by contentId
   */
  private async fetchContentWithLearningGuide(
    contentId: string
  ): Promise<string> {
    try {
      const content = await this.prisma.content.findUnique({
        where: { id: contentId },
        select: {
          content: true,
          learningGuide: true,
        },
      });

      if (!content) {
        this.logger.warn(`Content ${contentId} not found, using empty content`);
        return '';
      }

      // Combine content with learning guide for comprehensive quiz generation
      let combinedContent = content.content;

      if (content.learningGuide) {
        const learningGuide = content.learningGuide as any;

        // Add learning guide sections to the content
        if (learningGuide.sections && Array.isArray(learningGuide.sections)) {
          const sectionsText = learningGuide.sections
            .map((section: any) => {
              let sectionContent = `\n\n## ${section.title}\n${section.content}`;

              // Add examples if available
              if (section.examples && section.examples.length > 0) {
                sectionContent += '\n\n### Examples:\n';
                sectionContent += section.examples.join('\n\n');
              }

              // Add explanations if available
              if (section.explanation) {
                sectionContent += `\n\n### Explanation:\n${section.explanation}`;
              }

              return sectionContent;
            })
            .join('\n');

          combinedContent += `\n\n# Learning Guide\n${sectionsText}`;
        }
      }

      this.logger.debug(
        `Combined content length: ${combinedContent.length} characters`
      );

      return combinedContent;
    } catch (error) {
      this.logger.error(
        `Failed to fetch content ${contentId}: ${error.message}`
      );
      return '';
    }
  }

  /**
   * Create UserDocument references for uploaded files
   */
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
          this.logger.debug(
            `Job ${jobId}: Created UserDocument reference for ${file.originalname}`
          );
        }
      }
    } catch (error) {
      // Log warning but don't fail the job
      this.logger.warn(
        `Job ${jobId}: Failed to create UserDocument references: ${error.message}`
      );
    }
  }
}
