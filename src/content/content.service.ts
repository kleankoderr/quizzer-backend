import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import {
  CreateContentDto,
  CreateHighlightDto,
  UpdateContentDto,
} from "./dto/content.dto";
import { TaskService } from "../task/task.service";

import { QuizService } from "../quiz/quiz.service";
import { FlashcardService } from "../flashcard/flashcard.service";
import { PDFParse } from "pdf-parse";

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly taskService: TaskService,

    private readonly quizService: QuizService,
    private readonly flashcardService: FlashcardService,
  ) {}

  /**
   * Sanitize extracted text to remove null bytes and other characters
   * that are invalid in PostgreSQL UTF-8 encoding
   */
  private sanitizeText(text: string): string {
    if (!text) return "";

    return (
      text
        // Remove null bytes (0x00) which are invalid in PostgreSQL UTF-8
        .replace(/\0/g, "")
        // Remove other control characters except newlines, tabs, and carriage returns
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        // Normalize whitespace - replace multiple spaces with single space
        .replace(/  +/g, " ")
        // Normalize line breaks
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Remove excessive newlines (more than 2 consecutive)
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    );
  }

  async deleteContent(userId: string, contentId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });

    if (!content || content.userId !== userId) {
      throw new NotFoundException("Content not found");
    }

    // Delete associated quiz if exists
    if (content.quizId) {
      try {
        await this.quizService.deleteQuiz(content.quizId, userId);
      } catch (_error) {}
    }

    // Delete associated flashcard set if exists
    if (content.flashcardSetId) {
      try {
        await this.flashcardService.deleteFlashcardSet(
          content.flashcardSetId,
          userId,
        );
      } catch (_error) {}
    }

    return this.prisma.content.delete({
      where: { id: contentId },
    });
  }

  async generateFromTopic(userId: string, topic: string) {
    const task = await this.taskService.createTask(
      userId,
      "CONTENT_GENERATION",
    );

    // Run in background
    this.generateContentInBackground(userId, topic, task.id);

    return { taskId: task.id };
  }

  private async generateContentInBackground(
    userId: string,
    topic: string,
    taskId: string,
  ) {
    try {
      // Verify user exists before creating content
      const userExists = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userExists) {
        throw new BadRequestException(
          `User with ID ${userId} not found. Please log in again.`,
        );
      }

      const generatedContent = await this.aiService.generateContent({
        prompt: `Generate comprehensive educational content about: ${topic}. Include key concepts, explanations, and examples.`,
        maxTokens: 2000,
      });

      const content = await this.prisma.content.create({
        data: {
          title: `${topic} - Study Material`,
          content: generatedContent,
          topic,
          userId,
        },
      });

      // Generate learning guide
      try {
        const learningGuide = await this.aiService.generateLearningGuide({
          topic,
          content: generatedContent,
        });

        await this.prisma.content.update({
          where: { id: content.id },
          data: { learningGuide },
        });
      } catch (_err) {}

      await this.taskService.updateTask(taskId, "COMPLETED", {
        contentId: content.id,
      });
    } catch (error) {
      await this.taskService.updateTask(taskId, "FAILED", null, error.message);
    }
  }

  async createFromFile(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    // Check file type
    const allowedTypes = [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        "Invalid file type. Only PDF, DOCX, and TXT files are allowed.",
      );
    }

    // Extract text from file
    let extractedText = "";

    try {
      if (file.mimetype === "text/plain") {
        extractedText = file.buffer.toString("utf-8");
      } else if (file.mimetype === "application/pdf") {
        // Use pdf-parse for PDF files
        const parser = new PDFParse({ data: file.buffer });
        const pdfData = await parser.getText();
        extractedText = pdfData.text;
      } else if (
        file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        // Use mammoth for DOCX files
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = result.value;
      }
    } catch (_error) {
      // Log the error stack for debugging
      if (error instanceof Error) {
      }
      throw new BadRequestException(
        `Failed to extract text from ${file.originalname}. Please ensure the file is valid and not corrupted.`,
      );
    }

    // Sanitize the extracted text to remove null bytes and invalid characters
    extractedText = this.sanitizeText(extractedText);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new BadRequestException(
        "No readable text content found in the uploaded file. The file may be corrupted or contain only images.",
      );
    }

    // Determine topic using AI
    const topic = await this.aiService.generateContent({
      prompt: `Based on this text, provide a single concise topic name (max 3 words): ${extractedText.substring(0, 500)}`,
      maxTokens: 20,
    });

    // Generate title using AI (NOT using filename)
    const title = await this.aiService.generateContent({
      prompt: `Based on this text, provide a single concise and descriptive title (max 10 words). Do not use quotes: ${extractedText.substring(0, 500)}`,
      maxTokens: 50,
    });

    // Verify user exists before creating content
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      throw new BadRequestException(
        `User with ID ${userId} not found. Please log in again.`,
      );
    }

    const content = await this.prisma.content.create({
      data: {
        title: title.trim(),
        content: extractedText,
        topic: topic.trim(),
        userId,
      },
    });

    // Generate learning guide in background
    try {
      const learningGuide = await this.aiService.generateLearningGuide({
        topic,
        content: extractedText.substring(0, 10000),
      });

      await this.prisma.content.update({
        where: { id: content.id },
        data: { learningGuide },
      });
    } catch (_err) {}

    return content;
  }

  async createContent(userId: string, createContentDto: CreateContentDto) {
    // Verify user exists before creating content
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      throw new BadRequestException(
        `User with ID ${userId} not found. Please log in again.`,
      );
    }

    return this.prisma.content.create({
      data: {
        ...createContentDto,
        userId,
      },
    });
  }

  async getContents(
    userId: string,
    topic?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.content.findMany({
        where: {
          userId,
          ...(topic ? { topic } : {}),
        },
        include: {
          quiz: { select: { id: true } },
          flashcardSet: { select: { id: true } },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.content.count({
        where: {
          userId,
          ...(topic ? { topic } : {}),
        },
      }),
    ]);

    const mappedData = data.map((item) => ({
      ...item,
      quizId: item.quizId || item.quiz?.id,
      flashcardSetId: item.flashcardSetId || item.flashcardSet?.id,
      quiz: undefined,
      flashcardSet: undefined,
    }));

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getContentById(userId: string, contentId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      include: {
        highlights: true,
        quiz: {
          select: { id: true },
        },
        flashcardSet: {
          select: { id: true },
        },
      },
    });

    if (!content || content.userId !== userId) {
      throw new NotFoundException("Content not found");
    }

    let quizId = content.quizId;
    let flashcardSetId = content.flashcardSetId;

    // Backfill IDs from relations if missing (backward compatibility)
    const relationQuizId = content.quiz?.id;
    const relationFlashcardSetId = content.flashcardSet?.id;

    if (!quizId && relationQuizId) {
      quizId = relationQuizId;
      // Async update to persist the mapping
      this.prisma.content.update({
        where: { id: contentId },
        data: { quizId },
      });
    }

    if (!flashcardSetId && relationFlashcardSetId) {
      flashcardSetId = relationFlashcardSetId;
      // Async update to persist the mapping
      this.prisma.content
        .update({
          where: { id: contentId },
          data: { flashcardSetId },
        })
        .catch((_err) => {});
    }

    return {
      ...content,
      quizId,
      flashcardSetId,
    };
  }

  async updateContent(
    userId: string,
    contentId: string,
    updateContentDto: UpdateContentDto,
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });

    if (!content || content.userId !== userId) {
      throw new NotFoundException("Content not found");
    }

    return this.prisma.content.update({
      where: { id: contentId },
      data: updateContentDto,
    });
  }

  async addHighlight(
    userId: string,
    contentId: string,
    createHighlightDto: CreateHighlightDto,
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });

    if (!content || content.userId !== userId) {
      throw new NotFoundException("Content not found");
    }

    return this.prisma.highlight.create({
      data: {
        ...createHighlightDto,
        contentId,
        userId,
      },
    });
  }

  async deleteHighlight(userId: string, highlightId: string) {
    const highlight = await this.prisma.highlight.findUnique({
      where: { id: highlightId },
    });

    if (!highlight || highlight.userId !== userId) {
      throw new NotFoundException("Highlight not found");
    }

    return this.prisma.highlight.delete({
      where: { id: highlightId },
    });
  }
  async getPopularTopics() {
    const topics = await this.prisma.content.groupBy({
      by: ["topic"],
      _count: {
        topic: true,
      },
      orderBy: {
        _count: {
          topic: "desc",
        },
      },
      take: 10,
    });

    return topics.map((t) => t.topic);
  }

  async generateExplanation(
    userId: string,
    contentId: string,
    sectionTitle: string,
    sectionContent: string,
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });

    if (!content || content.userId !== userId) {
      throw new NotFoundException("Content not found");
    }

    return this.aiService.generateExplanation({
      topic: sectionTitle,
      context: sectionContent,
    });
  }

  async generateExample(
    userId: string,
    contentId: string,
    sectionTitle: string,
    sectionContent: string,
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });

    if (!content || content.userId !== userId) {
      throw new NotFoundException("Content not found");
    }

    return this.aiService.generateExample({
      topic: sectionTitle,
      context: sectionContent,
    });
  }
}
