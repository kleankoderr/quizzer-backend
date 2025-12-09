import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { EventFactory, EVENTS } from "../events/events.types";

export interface ContentJobData {
  userId: string;
  dto: {
    topic?: string;
    content?: string;
  };
  files?: Array<{
    originalname: string;
    cloudinaryUrl?: string;
    cloudinaryId?: string;
    googleFileUrl?: string;
    googleFileId?: string;
  }>;
}

@Processor("content-generation")
export class ContentProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<ContentJobData>): Promise<any> {
    const { userId, dto, files } = job.data;
    const jobId = job.id?.toString() || "unknown";
    this.logger.log(
      `Processing content generation job ${jobId} for user ${userId}`,
    );

    try {
      this.emitProgress(userId, jobId, "Starting content generation...", 10);
      await job.updateProgress(10);

      const userExists = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userExists) {
        throw new Error(`User with ID ${userId} not found`);
      }

      const fileReferences =
        files?.map((file) => ({
          googleFileUrl: file.googleFileUrl,
          googleFileId: file.googleFileId,
          originalname: file.originalname,
        })) || [];

      this.logger.debug(
        `Job ${jobId}: Using ${fileReferences.length} pre-uploaded file(s)`,
      );

      if (fileReferences.length > 0) {
        this.emitProgress(
          userId,
          jobId,
          `Processing ${fileReferences.length} file(s)...`,
          20,
        );
      }

      await job.updateProgress(20);

      this.logger.log(
        `Job ${jobId}: Generating content for topic: "${dto.topic || "from files/text"}"`,
      );
      this.emitProgress(
        userId,
        jobId,
        `Creating study material.. This might take a moment.`,
        40,
      );

      let generatedText: string;
      let topic: string;
      let title: string;

      if (dto.topic) {
        topic = dto.topic;
        generatedText = await this.aiService.generateContent({
          prompt: `Generate comprehensive educational content about: ${topic}, tailored for a Nigerian student. Include key concepts, explanations, and examples relevant to the Nigerian context.`,
          maxTokens: 2000,
        });
        title = `${topic} - Study Material`;
      } else if (dto.content) {
        generatedText = await this.aiService.generateContent({
          prompt: `Enhance and structure the following study notes into a comprehensive study guide tailored for a Nigerian student. Keep the original meaning but improve clarity, structure, and add missing key details if obvious.\n\nOriginal Notes:\n${dto.content}`,
          maxTokens: 2000,
        });

        topic = await this.aiService.generateContent({
          prompt: `Based on the following text, identify the main academic topic (max 3 words). Return ONLY the topic name.\n\nText:\n${dto.content.substring(0, 1000)}`,
          maxTokens: 50,
        });

        title = await this.aiService.generateContent({
          prompt: `Based on the following text, generate a concise, descriptive, and professional title (max 10 words). Return ONLY the title.\n\nText:\n${dto.content.substring(0, 1000)}`,
          maxTokens: 100,
        });
      } else {
        topic = "Study Material";
        title = "Generated Study Material";
        generatedText = "Content will be generated from uploaded files.";
      }

      this.emitProgress(userId, jobId, "Finalizing and saving...", 70);
      await job.updateProgress(70);

      const content = await this.prisma.content.create({
        data: {
          title: title.trim(),
          content: generatedText,
          topic: topic.trim(),
          userId,
        },
      });

      this.emitProgress(userId, jobId, "Generating learning guide...", 85);
      await job.updateProgress(85);

      try {
        const learningGuide = await this.aiService.generateLearningGuide({
          topic,
          content: content.content.substring(0, 10000),
        });

        await this.prisma.content.update({
          where: { id: content.id },
          data: { learningGuide },
        });
      } catch (_error) {
        this.logger.warn(
          `Failed to generate learning guide: ${_error.message}`,
        );
      }

      await job.updateProgress(100);
      this.logger.log(
        `Job ${jobId}: Successfully completed (Content ID: ${content.id})`,
      );

      this.eventEmitter.emit(
        EVENTS.CONTENT.COMPLETED,
        EventFactory.contentCompleted(userId, content.id, {
          title: content.title,
          topic: content.topic,
        }),
      );

      return {
        success: true,
        content,
      };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Failed to generate content`,
        error.stack,
      );
      this.eventEmitter.emit(
        EVENTS.CONTENT.FAILED,
        EventFactory.contentFailed(userId, jobId, error.message),
      );
      throw error;
    }
  }

  private emitProgress(
    userId: string,
    jobId: string,
    step: string,
    percentage: number,
  ) {
    this.eventEmitter.emit(
      EVENTS.CONTENT.PROGRESS,
      EventFactory.contentProgress(userId, jobId, step, percentage),
    );
  }
}
