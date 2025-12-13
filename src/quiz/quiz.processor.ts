import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { GenerateQuizDto } from './dto/quiz.dto';
import { QuizType } from '@prisma/client';
import { EventFactory } from '../events/events.types';
import { EVENTS } from '../events/events.constants';
import { UserDocumentService } from '../user-document/user-document.service';

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

// ==================== CONSTANTS ====================

const QUIZ_TYPE_MAP: Record<string, QuizType> = {
  standard: QuizType.STANDARD,
  timed: QuizType.TIMED_TEST,
  scenario: QuizType.SCENARIO_BASED,
};

// ==================== PROCESSOR ====================

@Processor('quiz-generation')
export class QuizProcessor extends WorkerHost {
  private readonly logger = new Logger(QuizProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userDocumentService: UserDocumentService
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
      // Step 1: Initialize and prepare
      await this.emitProgress(userId, jobId, 'Starting quiz generation...', 10);

      const fileReferences = this.prepareFileReferences(files);

      if (fileReferences.length > 0) {
        await this.emitProgress(
          userId,
          jobId,
          `Processing ${fileReferences.length} file(s)...`,
          20
        );
      } else {
        await job.updateProgress(20);
      }

      // Create UserDocument references for uploaded files
      if (files && files.length > 0) {
        await this.createUserDocumentReferences(userId, files, jobId);
      }

      // Step 2: Generate quiz with AI
      await this.emitProgress(
        userId,
        jobId,
        'Generating questions... This might take a moment.',
        40
      );

      const { questions, title, topic } = await this.generateQuizWithAI(
        dto,
        fileReferences
      );

      const shuffledQuestions = this.shuffleQuestions(questions);

      this.logger.log(
        `Job ${jobId}: Generated ${shuffledQuestions.length} question(s)`
      );

      await this.emitProgress(userId, jobId, 'Finalizing and saving...', 70);

      const quiz = await this.saveQuiz(
        userId,
        dto,
        contentId,
        title,
        topic,
        shuffledQuestions,
        files
      );

      // Step 4: Link to content if applicable
      if (contentId) {
        await this.linkToContent(contentId, quiz.id);
      }

      await job.updateProgress(100);

      this.logger.log(
        `Job ${jobId}: Successfully completed (Quiz ID: ${quiz.id})`
      );

      // Emit completion event
      this.eventEmitter.emit(
        EVENTS.QUIZ.COMPLETED,
        EventFactory.quizCompleted(userId, quiz.id, questions.length, {
          title: quiz.title,
          topic: quiz.topic,
        })
      );

      return {
        success: true,
        quiz,
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

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Prepare file references for AI service
   */

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

  /**
   * Generate quiz using AI service
   */
  private async generateQuizWithAI(
    dto: GenerateQuizDto,
    fileReferences: FileReference[]
  ) {
    return this.aiService.generateQuiz({
      topic: dto.topic,
      content: dto.content,
      fileReferences,
      numberOfQuestions: dto.numberOfQuestions,
      difficulty: dto.difficulty,
      quizType: dto.quizType,
      questionTypes: dto.questionTypes,
    });
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
        topic,
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
   * Emit progress event
   */
  private async emitProgress(
    userId: string,
    jobId: string,
    step: string,
    percentage: number
  ): Promise<void> {
    this.eventEmitter.emit(
      EVENTS.QUIZ.PROGRESS,
      EventFactory.quizProgress(userId, jobId, step, percentage)
    );
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
