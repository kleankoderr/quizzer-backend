import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, Inject } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { GenerateQuizDto } from "./dto/quiz.dto";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom } from "rxjs";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { QuizType } from "@prisma/client";

export interface QuizJobData {
  userId: string;
  dto: GenerateQuizDto;
  files?: Array<{
    path: string;
    originalname: string;
    mimetype: string;
    url?: string;
    publicId?: string;
  }>;
}

@Processor("quiz-generation")
export class QuizProcessor extends WorkerHost {
  private readonly logger = new Logger(QuizProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super();
  }

  async process(job: Job<QuizJobData>): Promise<any> {
    const { userId, dto, files } = job.data;
    this.logger.log(
      `Processing quiz generation job ${job.id} for user ${userId}`,
    );

    try {
      // Update progress
      await job.updateProgress(10);
      this.logger.debug(`Job ${job.id}: Converting file data`);

      // Download files if URLs are present
      const processedFiles: any[] = [];
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.url) {
            try {
              this.logger.debug(`Downloading file from ${file.url}`);
              const response = await lastValueFrom(
                this.httpService.get(file.url, { responseType: "arraybuffer" }),
              );
              processedFiles.push({
                buffer: Buffer.from(response.data),
                originalname: file.originalname,
                mimetype: file.mimetype,
              });
            } catch (error) {
              this.logger.error(
                `Failed to download file ${file.originalname}:`,
                error,
              );
              throw error;
            }
          } else {
            // Fallback for local paths (though likely undefined in this context)
            processedFiles.push(file);
          }
        }
      }

      await job.updateProgress(20);

      // Generate quiz using AI
      this.logger.log(`Job ${job.id}: Calling AI service to generate quiz`);
      const { questions, title, topic } = await this.aiService.generateQuiz({
        topic: dto.topic,
        content: dto.content,
        files: processedFiles,
        numberOfQuestions: dto.numberOfQuestions,
        difficulty: dto.difficulty,
        quizType: dto.quizType,
        questionTypes: dto.questionTypes,
      });

      this.logger.log(
        `Job ${job.id}: AI generated ${questions.length} questions`,
      );
      await job.updateProgress(70);

      // Determine source type
      let sourceType = "topic";
      if (dto.content) sourceType = "text";
      if (files && files.length > 0) sourceType = "file";

      // Get file URLs from job data
      const fileUrls = files?.map((f) => f.url).filter(Boolean) || [];

      await job.updateProgress(85);

      // Save quiz to database
      this.logger.debug(`Job ${job.id}: Saving quiz to database`);

      // Convert quizType string to enum
      let quizTypeEnum: QuizType = QuizType.STANDARD;
      if (dto.quizType) {
        const typeMap: Record<string, QuizType> = {
          standard: QuizType.STANDARD,
          timed: QuizType.TIMED_TEST,
          scenario: QuizType.SCENARIO_BASED,
        };
        quizTypeEnum = typeMap[dto.quizType.toLowerCase()] || QuizType.STANDARD;
      }

      const quiz = await this.prisma.quiz.create({
        data: {
          title,
          topic,
          difficulty: dto.difficulty,
          quizType: quizTypeEnum,
          timeLimit: dto.timeLimit,
          questions: questions as any,
          userId,
          sourceType,
          sourceFiles: fileUrls as string[],
          contentId: dto.contentId,
        },
      });

      // Update content quizId mapping if applicable
      if (dto.contentId) {
        await this.prisma.content.update({
          where: { id: dto.contentId },
          data: { quizId: quiz.id },
        });
      }

      await job.updateProgress(100);
      this.logger.log(
        `Job ${job.id}: Quiz generation completed successfully (Quiz ID: ${quiz.id})`,
      );

      return {
        success: true,
        quiz,
      };
    } catch (error) {
      this.logger.error(`Job ${job.id}: Quiz generation failed`, error);
      throw error;
    }
  }
}
