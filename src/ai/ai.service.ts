import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import * as fs from "node:fs/promises";
import { AiPrompts } from "./ai.prompts";

export interface QuizQuestion {
  questionType:
    | "true-false"
    | "single-select"
    | "multi-select"
    | "matching"
    | "fill-blank";
  question: string;
  options?: string[];
  correctAnswer: number | number[] | string | { [key: string]: string };
  explanation?: string;
  // For matching questions
  leftColumn?: string[];
  rightColumn?: string[];
}

export interface Flashcard {
  front: string;
  back: string;
  explanation?: string;
}

@Injectable()
export class AiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: any;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {
    const apiKey = this.configService.get<string>("GOOGLE_API_KEY");
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.7,
      },
    });
  }

  /**
   * Process uploaded files - text files and PDFs are read as bytes
   */
  /**
   * Process uploaded files - text files and PDFs are read as bytes
   */
  async processFiles(
    files: (
      | Express.Multer.File
      | {
          path?: string;
          buffer?: Buffer;
          originalname: string;
          mimetype: string;
        }
    )[]
  ): Promise<{ textContent?: string; pdfParts?: any[] }> {
    const textContents: string[] = [];
    const pdfParts: any[] = [];

    for (const file of files) {
      try {
        let fileBuffer: Buffer;

        if ("buffer" in file && file.buffer) {
          fileBuffer = file.buffer;
        } else if (file.path) {
          fileBuffer = await fs.readFile(file.path);
        } else {
          throw new Error(`File ${file.originalname} has no path or buffer`);
        }

        if (file.mimetype === "application/pdf") {
          // Read PDF as bytes for inline data
          pdfParts.push({
            inlineData: {
              data: fileBuffer.toString("base64"),
              mimeType: "application/pdf",
            },
          });
        } else {
          // Read text files directly
          const content = fileBuffer.toString("utf-8");
          textContents.push(content);
        }

        // Clean up uploaded file after processing if it was on disk
        if (file.path) {
          await fs.unlink(file.path).catch(() => {});
        }
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        throw new Error(`Failed to process file: ${file.originalname}`);
      }
    }

    return {
      textContent:
        textContents.length > 0
          ? textContents.join("\n\n=== NEXT DOCUMENT ===\n\n")
          : undefined,
      pdfParts: pdfParts.length > 0 ? pdfParts : undefined,
    };
  }

  /**
   * Generate quiz questions from text or files
   */
  async generateQuiz(params: {
    topic?: string;
    content?: string;
    files?: (
      | Express.Multer.File
      | {
          path?: string;
          buffer?: Buffer;
          originalname: string;
          mimetype: string;
        }
    )[];
    numberOfQuestions: number;
    difficulty: "easy" | "medium" | "hard";
    quizType?: "standard" | "timed" | "scenario";
    questionTypes?: (
      | "true-false"
      | "single-select"
      | "multi-select"
      | "matching"
      | "fill-blank"
    )[];
  }): Promise<{ questions: QuizQuestion[]; title: string; topic: string }> {
    const {
      topic,
      content,
      files,
      numberOfQuestions,
      difficulty,
      quizType = "standard",
      questionTypes = ["single-select", "true-false"],
    } = params;

    // Process files if provided
    let sourceContent = content || "";
    let pdfParts: any[] | undefined;
    if (files && files.length > 0) {
      const processed = await this.processFiles(files);
      sourceContent = processed.textContent || sourceContent;
      pdfParts = processed.pdfParts;
    }

    // Generate cache key based on params (excluding files for now as they are complex to hash efficiently here)
    const cacheKey = `quiz:${topic}:${numberOfQuestions}:${difficulty}:${quizType}:${questionTypes.join(",")}`;
    if (!files || files.length === 0) {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        return cached as any;
      }
    }

    // Build question type instructions
    const questionTypeInstructions =
      this.buildQuestionTypeInstructions(questionTypes);
    const quizTypeContext = this.buildQuizTypeContext(quizType);

    const prompt = AiPrompts.generateQuiz(
      topic || "",
      numberOfQuestions,
      difficulty,
      `${quizType} ${quizTypeContext}`,
      questionTypeInstructions,
      sourceContent
    );

    // Build request parts - PDFs first, then prompt
    const parts: any[] = [];
    if (pdfParts && pdfParts.length > 0) {
      parts.push(...pdfParts);
    }
    parts.push({ text: prompt });

    const result = await this.model.generateContent(parts);
    const response = await result.response;
    const responseText = response.text();

    // Parse JSON response
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText
        .replaceAll(/```json\n?/g, "")
        .replaceAll(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(cleanedResponse);
      const finalResult = {
        title: parsed.title || `${topic || "Quiz"} - ${difficulty}`,
        topic: parsed.topic || topic || "General Knowledge",
        questions: parsed.questions,
      };

      // Cache result if no files were used
      if (!files || files.length === 0) {
        await this.cacheManager.set(cacheKey, finalResult, 3600000); // Cache for 1 hour
      }

      return finalResult;
    } catch (error) {
      console.error("Failed to parse AI response:", responseText, error);
      throw new Error("Failed to generate valid quiz format");
    }
  }

  /**
   * Build instructions for question types
   */
  private buildQuestionTypeInstructions(questionTypes: string[]): string {
    const instructions: string[] = [];

    if (questionTypes.includes("true-false")) {
      instructions.push(
        "- True/False: Statement questions with True or False options"
      );
    }
    if (questionTypes.includes("single-select")) {
      instructions.push(
        "- Single-select: Multiple choice with one correct answer (4 options)"
      );
    }
    if (questionTypes.includes("multi-select")) {
      instructions.push(
        "- Multi-select: Multiple choice with multiple correct answers (4-6 options)"
      );
    }
    if (questionTypes.includes("matching")) {
      instructions.push(
        "- Matching: Match items from left column to right column (3-5 pairs)"
      );
    }
    if (questionTypes.includes("fill-blank")) {
      instructions.push(
        "- Fill-in-the-blank: Complete the sentence or phrase with the correct answer"
      );
    }

    return instructions.join("\n");
  }

  /**
   * Build context for quiz type
   */
  private buildQuizTypeContext(quizType: string): string {
    switch (quizType) {
      case "timed":
        return "(This quiz will be timed, so questions should be clear and focused)";
      case "scenario":
        return "(Questions should be scenario-based with real-world context and applications)";
      default:
        return "(Standard quiz format)";
    }
  }

  /**
   * Generate flashcards from topic, text, or files
   */
  async generateFlashcards(params: {
    topic?: string;
    content?: string;
    files?: (
      | Express.Multer.File
      | {
          path?: string;
          buffer?: Buffer;
          originalname: string;
          mimetype: string;
        }
    )[];
    numberOfCards: number;
  }): Promise<{ cards: Flashcard[]; title: string; topic: string }> {
    const { topic, content, files, numberOfCards } = params;

    // Process files if provided
    let sourceContent = content || "";
    let pdfParts: any[] | undefined;
    if (files && files.length > 0) {
      const processed = await this.processFiles(files);
      sourceContent = processed.textContent || sourceContent;
      pdfParts = processed.pdfParts;
    }

    const cacheKey = `flashcards:${topic}:${numberOfCards}`;
    if (!files || files.length === 0) {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        return cached as any;
      }
    }

    const prompt = AiPrompts.generateFlashcards(
      topic || "",
      numberOfCards,
      sourceContent
    );

    // Build request parts - PDFs first, then prompt
    const parts: any[] = [];
    if (pdfParts && pdfParts.length > 0) {
      parts.push(...pdfParts);
    }
    parts.push({ text: prompt });

    const result = await this.model.generateContent(parts);
    const response = await result.response;
    const responseText = response.text();

    // Parse JSON response
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText
        .replaceAll(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(cleanedResponse);
      const finalResult = {
        title: parsed.title || `${topic || "Flashcards"}`,
        topic: parsed.topic || topic || "Study Cards",
        cards: parsed.cards,
      };

      if (!files || files.length === 0) {
        await this.cacheManager.set(cacheKey, finalResult, 3600000); // Cache for 1 hour
      }

      return finalResult;
    } catch (error) {
      console.error("Failed to parse AI response:", responseText);
      throw new Error("Failed to generate valid flashcard format");
    }
  }

  /**
   * Generate personalized recommendations based on user performance
   */
  async generateRecommendations(params: {
    weakTopics: string[];
    recentAttempts: any[];
  }): Promise<Array<{ topic: string; reason: string; priority: string }>> {
    const { weakTopics, recentAttempts } = params;

    const cacheKey = `recommendations:${weakTopics.join(",")}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached as any;
    }

    const prompt = AiPrompts.generateRecommendations(
      weakTopics,
      recentAttempts
    );

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    try {
      const cleanedResponse = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const finalResult = JSON.parse(cleanedResponse);
      await this.cacheManager.set(cacheKey, finalResult, 3600000); // Cache for 1 hour
      return finalResult;
    } catch (error) {
      console.error("Failed to parse recommendations:", responseText);
      return [];
    }
  }

  /**
   * Generate generic content using AI
   */
  async generateContent(params: {
    prompt: string;
    maxTokens?: number;
  }): Promise<string> {
    const { prompt, maxTokens = 1000 } = params;

    // Simple caching for generic content
    const cacheKey = `content:${Buffer.from(prompt).toString("base64").substring(0, 50)}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached as string;
    }

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    await this.cacheManager.set(cacheKey, text, 3600000); // Cache for 1 hour
    return text;
  }
}
