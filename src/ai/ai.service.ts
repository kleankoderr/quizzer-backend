import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { createHash } from 'node:crypto';
import JSON5 from 'json5';
import { JSONParser } from '@streamparser/json';
import { AiPrompts } from './ai.prompts';
import {
  QuizGenerationResponse,
  FlashcardGenerationResponse,
  LearningGuideResponse,
  RecommendationResponse,
  ExampleResponse,
  ExplanationResponse,
} from './dto/ai-response.dto';

export interface QuizQuestion {
  questionType:
    | 'true-false'
    | 'single-select'
    | 'multi-select'
    | 'matching'
    | 'fill-blank';
  question: string;
  options?: string[];
  correctAnswer:
    | number
    | number[]
    | string
    | string[]
    | { [key: string]: string };
  explanation?: string;
  leftColumn?: string[];
  rightColumn?: string[];
  citation?: string;
}

export interface Flashcard {
  front: string;
  back: string;
  explanation?: string;
}

export interface FileReference {
  googleFileUrl?: string;
  googleFileId?: string;
  originalname: string;
  mimetype?: string;
}

export interface QuizGenerationParams {
  topic?: string;
  content?: string;
  fileReferences?: FileReference[];
  numberOfQuestions: number;
  difficulty: 'easy' | 'medium' | 'hard';
  quizType?: 'standard' | 'timed' | 'scenario';
  questionTypes?: (
    | 'true-false'
    | 'single-select'
    | 'multi-select'
    | 'matching'
    | 'fill-blank'
  )[];
}

export interface FlashcardGenerationParams {
  topic?: string;
  content?: string;
  fileReferences?: FileReference[];
  numberOfCards: number;
}

export interface RecommendationParams {
  weakTopics: string[];
  recentAttempts: any[];
}

export interface ContentGenerationParams {
  prompt: string;
  maxTokens?: number;
}

export interface LearningGuideParams {
  topic?: string;
  content?: string;
}

export interface ExplanationParams {
  topic: string;
  context: string;
}

// Model selection strategy - configurable via environment
const MODELS = {
  PREMIUM: process.env.GEMINI_MODEL_PREMIUM || 'gemini-2.5-flash',
  STANDARD: process.env.GEMINI_MODEL_STANDARD || 'gemini-2.0-flash',
  LITE: process.env.GEMINI_MODEL_LITE || 'gemini-2.0-flash-lite',
};

const MODEL_MAPPING: Record<string, string> = {
  quiz: MODELS.PREMIUM, // Lite model for quizzes
  flashcard: MODELS.PREMIUM, // Lite model for flashcards
  'learning-guide': MODELS.PREMIUM, // Premium model for learning guides
  explanation: MODELS.PREMIUM, // Lite model for explanations
  example: MODELS.PREMIUM, // Lite model for examples
  recommendation: MODELS.STANDARD, // Standard model for recommendations
  companion: MODELS.PREMIUM, // Lite model for companion interactions
  content: MODELS.PREMIUM, // Lite model for generic content
};

const DEFAULT_TEMPERATURE = 0.7;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly CACHE_TTLS: {
    QUIZ_TOPIC: number;
    QUIZ_FILE: number;
    FLASHCARD_TOPIC: number;
    FLASHCARD_FILE: number;
    LEARNING_GUIDE: number;
    EXPLANATION: number;
    EXAMPLE: number;
    RECOMMENDATION: number;
    COMPANION: number;
    GENERIC_CONTENT: number;
  };

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // Initialize cache TTLs from environment variables with defaults
    this.CACHE_TTLS = {
      QUIZ_TOPIC: this.configService.get<number>(
        'CACHE_TTL_QUIZ_TOPIC_MS',
        86400000
      ), // 24 hours
      QUIZ_FILE: this.configService.get<number>(
        'CACHE_TTL_QUIZ_FILE_MS',
        86400000
      ), // 24 hours
      FLASHCARD_TOPIC: this.configService.get<number>(
        'CACHE_TTL_FLASHCARD_TOPIC_MS',
        86400000
      ), // 24 hours
      FLASHCARD_FILE: this.configService.get<number>(
        'CACHE_TTL_FLASHCARD_FILE_MS',
        86400000
      ), // 24 hours
      LEARNING_GUIDE: this.configService.get<number>(
        'CACHE_TTL_LEARNING_GUIDE_MS',
        43200000
      ), // 12 hours
      EXPLANATION: this.configService.get<number>(
        'CACHE_TTL_EXPLANATION_MS',
        43200000
      ), // 12 hours
      EXAMPLE: this.configService.get<number>('CACHE_TTL_EXAMPLE_MS', 43200000), // 12 hours
      RECOMMENDATION: this.configService.get<number>(
        'CACHE_TTL_RECOMMENDATION_MS',
        1800000
      ), // 30 minutes
      COMPANION: this.configService.get<number>(
        'CACHE_TTL_COMPANION_MS',
        3600000
      ), // 1 hour
      GENERIC_CONTENT: this.configService.get<number>(
        'CACHE_TTL_GENERIC_CONTENT_MS',
        3600000
      ), // 1 hour
    };

    this.logger.log('Initialized AI service with tiered model strategy');
  }

  /**
   * Get appropriate model for task type
   */
  private getModelForTask(taskType: string) {
    const modelName = MODEL_MAPPING[taskType] || MODELS.STANDARD;

    this.logger.debug(`Selected model ${modelName} for task type: ${taskType}`);

    return this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: DEFAULT_TEMPERATURE,
      },
    });
  }

  /**
   * Generate content with specific Gemini model
   */
  private async generateWithGeminiModel(
    model: any,
    prompt: string,
    fileReferences?: FileReference[],
    taskType?: string
  ): Promise<string> {
    try {
      const parts = this.buildGeminiRequestParts(fileReferences, prompt);
      const result = await model.generateContent(parts);
      const response = await result.response;
      return response.text();
    } catch (error) {
      this.logger.error(
        `Gemini API call failed for task type "${taskType}":`,
        error.stack
      );
      throw new Error(
        `AI generation failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Generate quiz questions from topic, content, or file references
   */
  async generateQuiz(
    params: QuizGenerationParams
  ): Promise<QuizGenerationResponse> {
    const {
      topic,
      content,
      fileReferences,
      numberOfQuestions,
      difficulty,
      quizType = 'standard',
      questionTypes = ['single-select', 'true-false'],
    } = params;

    // Validate input first (fast, synchronous)
    this.validateGenerationInput(topic, content, fileReferences, 'quiz');

    // Build cache key (file-based or topic-based)
    let cacheKey: string;
    if (fileReferences && fileReferences.length > 0) {
      cacheKey = this.buildFileCacheKey(fileReferences, {
        type: 'quiz',
        numberOfItems: numberOfQuestions,
        difficulty,
        quizType,
      });
    } else {
      cacheKey = this.buildQuizCacheKey(
        topic,
        numberOfQuestions,
        difficulty,
        quizType,
        questionTypes
      );
    }

    // Check cache
    const cached = await this.getFromCache<QuizGenerationResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for quiz: ${cacheKey}`);
      return cached;
    }

    // Generate with AI
    const questionTypeInstructions =
      this.buildQuestionTypeInstructions(questionTypes);
    const quizTypeContext = this.buildQuizTypeContext(quizType);

    const prompt = AiPrompts.generateQuiz(
      topic || '',
      numberOfQuestions,
      difficulty,
      `${quizType} ${quizTypeContext}`,
      questionTypeInstructions,
      content || ''
    );

    const model = this.getModelForTask('quiz');
    const result = await this.generateWithGeminiModel(
      model,
      prompt,
      fileReferences,
      'quiz'
    );

    // Parse and validate
    const parsed = await this.parseJsonResponse<any>(result, 'quiz');
    const finalResult = {
      title: parsed.title || `${topic || 'Quiz'} - ${difficulty}`,
      topic: parsed.topic || topic || 'General Knowledge',
      questions: this.validateQuizQuestions(parsed.questions),
    };

    // Cache result with feature-specific TTL
    const ttl =
      fileReferences && fileReferences.length > 0
        ? this.CACHE_TTLS.QUIZ_FILE
        : this.CACHE_TTLS.QUIZ_TOPIC;
    await this.setCache(cacheKey, finalResult, ttl).catch((err) =>
      this.logger.warn(`Cache write failed: ${err.message}`)
    );

    return finalResult;
  }

  /**
   * Generate flashcards from topic, content, or file references
   */
  async generateFlashcards(
    params: FlashcardGenerationParams
  ): Promise<FlashcardGenerationResponse> {
    const { topic, content, fileReferences, numberOfCards } = params;

    // Validate input
    this.validateGenerationInput(topic, content, fileReferences, 'flashcards');

    // Build cache key (file-based or topic-based)
    let cacheKey: string;
    if (fileReferences && fileReferences.length > 0) {
      cacheKey = this.buildFileCacheKey(fileReferences, {
        type: 'flashcard',
        numberOfItems: numberOfCards,
      });
    } else {
      cacheKey = `flashcards:${topic}:${numberOfCards}`;
    }

    // Check cache
    const cached =
      await this.getFromCache<FlashcardGenerationResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for flashcards: ${cacheKey}`);
      return cached;
    }

    // Generate with Gemini
    const prompt = AiPrompts.generateFlashcards(
      topic || '',
      numberOfCards,
      content || ''
    );
    const model = this.getModelForTask('flashcard');
    const result = await this.generateWithGeminiModel(
      model,
      prompt,
      fileReferences,
      'flashcard'
    );

    // Parse and validate
    const parsed = await this.parseJsonResponse<any>(result, 'flashcards');
    const finalResult = {
      title: parsed.title || `${topic || 'Flashcards'}`,
      topic: parsed.topic || topic || 'Study Cards',
      cards: this.validateFlashcards(parsed.cards),
    };

    // Cache result with feature-specific TTL
    const ttl =
      fileReferences && fileReferences.length > 0
        ? this.CACHE_TTLS.FLASHCARD_FILE
        : this.CACHE_TTLS.FLASHCARD_TOPIC;
    await this.setCache(cacheKey, finalResult, ttl).catch((err) =>
      this.logger.warn(`Cache write failed: ${err.message}`)
    );

    return finalResult;
  }

  /**
   * Generate personalized recommendations based on user performance
   */
  async generateRecommendations(
    params: RecommendationParams
  ): Promise<RecommendationResponse[]> {
    const { weakTopics, recentAttempts } = params;

    // Build cache key and prompt in parallel with cache check
    const cacheKey = `recommendations:${weakTopics.join(',')}`;

    const [cached, prompt] = await Promise.all([
      this.getFromCache<any[]>(cacheKey),
      Promise.resolve(
        AiPrompts.generateRecommendations(weakTopics, recentAttempts)
      ),
    ]);

    if (cached) {
      this.logger.debug(`Cache hit for recommendations: ${cacheKey}`);
      return cached;
    }

    // Generate with Gemini
    const model = this.getModelForTask('recommendation');
    const result = await this.generateWithGeminiModel(
      model,
      prompt,
      undefined,
      'recommendation'
    );

    // Parse response
    try {
      const parsed = await this.parseJsonResponse<any[]>(
        result,
        'recommendations'
      );
      // Cache with recommendation-specific TTL (30 minutes for personalized content)
      this.setCache(cacheKey, parsed, this.CACHE_TTLS.RECOMMENDATION).catch(
        () => {}
      );
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse recommendations:', error.stack);
      return []; // Return empty array on failure
    }
  }

  /**
   * Generate a structured learning guide
   */
  /**
   * Generate comprehensive learning guide from unified inputs
   */
  /**
   * Generate comprehensive learning guide from unified inputs
   */
  async generateLearningGuideFromInputs(
    topic?: string,
    content?: string,
    fileReferences?: FileReference[]
  ): Promise<LearningGuideResponse> {
    // Validate inputs
    if (
      !topic &&
      !content &&
      (!fileReferences || fileReferences.length === 0)
    ) {
      throw new Error(
        'At least one of topic, content, or fileReferences must be provided'
      );
    }

    // Build cache key (file-based or content-based)
    let cacheKey: string;
    if (fileReferences && fileReferences.length > 0) {
      cacheKey = this.buildFileCacheKey(fileReferences, {
        type: 'learning_material',
        numberOfItems: 1, // Not applicable for learning guides
      });
    } else {
      cacheKey = `learning_guide:${topic || ''}:${content?.length || 0}`;
    }

    const cached = await this.getFromCache<LearningGuideResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for learning guide: ${cacheKey}`);
      return cached;
    }

    const prompt = AiPrompts.generateComprehensiveLearningGuide(
      topic || '',
      content || '',
      fileReferences && fileReferences.length > 0
        ? 'See attached files for context.'
        : ''
    );

    const model = this.getModelForTask('learning-guide');
    const result = await this.generateWithGeminiModel(
      model,
      prompt,
      fileReferences,
      'learning-guide'
    );

    try {
      const parsed = await this.parseJsonResponse<LearningGuideResponse>(
        result,
        'learning guide'
      );

      // Basic validation
      if (
        !parsed.learningGuide ||
        !Array.isArray(parsed.learningGuide.sections)
      ) {
        this.logger.warn('AI returned invalid structure, attempting to fix...');
        // Fallback verification could go here, but for now we rely on the prompt instructions
      }

      // Cache with learning guide-specific TTL (12 hours for comprehensive content)
      this.setCache(cacheKey, parsed, this.CACHE_TTLS.LEARNING_GUIDE).catch(
        () => {}
      );
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse learning guide response', error.stack);
      throw error;
    }
  }

  /**
   * Generate generic content using AI
   */
  async generateContent(params: ContentGenerationParams): Promise<string> {
    const { prompt, maxTokens } = params;

    // Build cache key
    const promptHash = Buffer.from(prompt).toString('base64').substring(0, 50);
    const cacheKey = `content:${promptHash}`;

    // Check cache
    const cached = await this.getFromCache<string>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for content: ${cacheKey}`);
      return cached;
    }

    // Get appropriate model for generic content
    const model = this.getModelForTask('content');

    // Generate with optional token limit
    let result: { response: any };
    if (maxTokens) {
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: DEFAULT_TEMPERATURE,
        },
      });
    } else {
      result = await model.generateContent(prompt);
    }

    const response = await result.response;
    const text = response.text();

    // Cache result
    this.setCache(cacheKey, text, this.CACHE_TTLS.GENERIC_CONTENT).catch(
      () => {}
    );

    return text;
  }

  /**
   * Build Gemini API request parts with Google File API references
   * Based on: https://ai.google.dev/gemini-api/docs/files#javascript
   */
  private buildGeminiRequestParts(
    fileReferences: FileReference[] | undefined,
    prompt: string
  ): any[] {
    const parts: any[] = [];

    // Add file references using Google File API URIs
    if (fileReferences && fileReferences.length > 0) {
      for (const fileRef of fileReferences) {
        const fileUri = this.extractFileUri(fileRef);
        if (fileUri) {
          parts.push({
            fileData: {
              mimeType:
                fileRef.mimetype || this.inferMimeType(fileRef.originalname),
              fileUri: fileUri,
            },
          });
        } else {
          this.logger.warn(
            `Skipping file ${fileRef.originalname}: no valid Google File URI`
          );
        }
      }
    }

    // Add the text prompt
    parts.push({ text: prompt });

    return parts;
  }

  /**
   * Generate a simpler explanation for a concept
   */
  async generateExplanation(
    params: ExplanationParams
  ): Promise<ExplanationResponse> {
    const { topic, context } = params;
    const prompt = AiPrompts.generateExplanation(topic, context);

    const model = this.getModelForTask('explanation');
    const result = await this.generateWithGeminiModel(
      model,
      prompt,
      undefined,
      'explanation'
    );

    return { explanation: result };
  }

  /**
   * Generate more examples for a concept
   */
  async generateExample(params: ExplanationParams): Promise<ExampleResponse> {
    const { topic, context } = params;
    const prompt = AiPrompts.generateExample(topic, context);

    const model = this.getModelForTask('example');
    const result = await this.generateWithGeminiModel(
      model,
      prompt,
      undefined,
      'example'
    );

    return { examples: result };
  }

  /**
   * Extract a concise title from content
   */
  private extractFileUri(fileRef: FileReference): string | null {
    if (fileRef.googleFileUrl) {
      // If it's already a full URI, return as-is
      if (
        fileRef.googleFileUrl.startsWith(
          'https://generativelanguage.googleapis.com/v1beta/files/'
        )
      ) {
        return fileRef.googleFileUrl;
      }

      // If it contains "files/", extract the ID
      if (fileRef.googleFileUrl.includes('files/')) {
        const fileId = fileRef.googleFileUrl.split('files/')[1].split('?')[0];
        return `https://generativelanguage.googleapis.com/v1beta/files/${fileId}`;
      }

      // Assume it's a bare file ID
      return `https://generativelanguage.googleapis.com/v1beta/files/${fileRef.googleFileUrl}`;
    }

    if (fileRef.googleFileId) {
      return `https://generativelanguage.googleapis.com/v1beta/files/${fileRef.googleFileId}`;
    }

    return null;
  }

  /**
   * Infer MIME type from filename
   */
  private inferMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Parse JSON response from Gemini with robust error handling
   * Uses multiple strategies to handle malformed JSON from AI responses
   */

  private async parseJsonResponse<T>(
    responseText: string,
    context: string
  ): Promise<T> {
    // Strategy 1: Attempt to extract JSON payload using brace matching (most robust)
    try {
      const extracted = this.extractJsonPayload(responseText);
      if (extracted) {
        return JSON5.parse(extracted);
      }
    } catch (_error) {
      this.logger.debug(
        `Brace extraction parsing failed for ${context}, trying next strategy`
      );
    }

    // Strategy 2: Clean and parse with JSON5 (handles relaxed JSON syntax)
    try {
      const cleaned = this.cleanJsonResponse(responseText);
      return JSON5.parse(cleaned);
    } catch (_error) {
      this.logger.debug(
        `JSON5 parsing failed for ${context}, trying fallback strategies`
      );
    }

    // Strategy 3: Sanitize control characters and try again
    try {
      const sanitized = this.sanitizeJsonString(responseText);
      const cleaned = this.cleanJsonResponse(sanitized);
      return JSON5.parse(cleaned);
    } catch (_error) {
      this.logger.debug(
        `Sanitized JSON5 parsing failed for ${context}, trying next strategy`
      );
    }

    // Strategy 4: Try to extract JSON from markdown code blocks more aggressively (greedy)
    try {
      const extracted = this.extractJsonFromMarkdown(responseText);
      return JSON5.parse(extracted);
    } catch (_error) {
      this.logger.debug(
        `Markdown extraction failed for ${context}, trying standard JSON`
      );
    }

    // Strategy 5: Streaming Parser (handles large/partial JSON)
    try {
      return await this.parseStreamingJson<T>(responseText);
    } catch (_error) {
      this.logger.debug(
        `Streaming parsing failed for ${context}, trying final strategy`
      );
    }

    // Strategy 6: Last resort - try standard JSON.parse on cleaned response
    try {
      const cleaned = this.cleanJsonResponse(responseText);
      return JSON.parse(cleaned) as T;
    } catch (error) {
      // All strategies failed - log detailed error information
      this.logger.error(`Failed to parse ${context} response:`, error.stack);
      this.logger.debug(`Response length: ${responseText.length} characters`);
      this.logger.debug(`First 500 chars: ${responseText.substring(0, 500)}`);
      this.logger.debug(
        `Last 500 chars: ${responseText.substring(Math.max(0, responseText.length - 500))}`
      );

      throw new Error(
        `Failed to parse ${context} response after trying multiple strategies: ${error.message || 'Invalid JSON'}`
      );
    }
  }

  /**
   * Parse potentially incomplete or streaming JSON using @streamparser/json
   */
  private async parseStreamingJson<T>(text: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const parser = new JSONParser();
      let result: any = null;
      let foundValue = false;

      parser.onValue = ({ value, key }) => {
        if (key === undefined) {
          // Top-level value completed
          result = value;
          foundValue = true;
        }
      };

      parser.onError = (error) => {
        // If we found a value before error (e.g. trailing characters), resolve with it
        if (foundValue && result !== null) {
          resolve(result as T);
        } else {
          reject(error);
        }
      };

      parser.onEnd = () => {
        if (foundValue && result !== null) {
          resolve(result as T);
        } else {
          reject(new Error('No valid JSON found in stream'));
        }
      };

      try {
        parser.write(text);
        parser.end();
      } catch (error) {
        if (foundValue && result !== null) {
          resolve(result as T);
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * Extract the JSON payload by finding the outermost braces or brackets.
   * This handles cases where the JSON is wrapped in text or markdown code blocks,
   * without being confused by internal code blocks.
   */
  private extractJsonPayload(text: string): string | null {
    const firstOpenBrace = text.indexOf('{');
    const firstOpenBracket = text.indexOf('[');

    let startIndex = -1;
    let isObject = false;

    // Determine start index and type based on what comes first
    if (
      firstOpenBrace !== -1 &&
      (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)
    ) {
      startIndex = firstOpenBrace;
      isObject = true;
    } else if (firstOpenBracket !== -1) {
      startIndex = firstOpenBracket;
      isObject = false;
    }

    if (startIndex === -1) return null;

    // Find the corresponding last closing character
    const endIndex = text.lastIndexOf(isObject ? '}' : ']');

    if (endIndex !== -1 && endIndex > startIndex) {
      return text.substring(startIndex, endIndex + 1);
    }

    return null;
  }

  /**
   * Clean JSON response by removing markdown code blocks
   * Note: This is a destructive operation that might break nested code blocks
   */
  private cleanJsonResponse(text: string): string {
    return text
      .replaceAll(/```json\s*/gi, '')
      .replaceAll(/```\s*/g, '')
      .trim();
  }

  /**
   * Sanitize control characters that break JSON parsing
   */
  private sanitizeJsonString(text: string): string {
    // Replace problematic control characters
    return text
      .replaceAll(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n, \r, \t
      .replaceAll(/\r\n/g, '\\n') // Normalize line endings
      .replaceAll(/\n/g, '\\n') // Escape newlines
      .replaceAll(/\r/g, '\\n') // Escape carriage returns
      .replaceAll(/\t/g, '\\t'); // Escape tabs
  }

  /**
   * Extract JSON from markdown code blocks (greedy version)
   */
  private extractJsonFromMarkdown(text: string): string {
    // Try to find JSON within code blocks (greedy match to capture nested blocks)
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*)```/i);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Fallback: try to just trim
    return text.trim();
  }

  /**
   * Validate input sources for generation
   */
  private validateGenerationInput(
    topic: string | undefined,
    content: string | undefined,
    fileReferences: FileReference[] | undefined,
    generationType: string
  ): void {
    if (
      !topic &&
      !content &&
      (!fileReferences || fileReferences.length === 0)
    ) {
      throw new Error(
        `At least one of topic, content, or fileReferences must be provided for ${generationType} generation`
      );
    }
  }

  /**
   * Validate quiz questions structure
   */
  private validateQuizQuestions(questions: any[]): QuizQuestion[] {
    if (!Array.isArray(questions)) {
      throw new TypeError('Invalid questions format: expected array');
    }

    const validQuestions = questions.filter((q) => {
      if (!q.question || !q.questionType) {
        return false;
      }

      if (q.questionType === 'matching') {
        if (
          !q.leftColumn ||
          !q.rightColumn ||
          !Array.isArray(q.leftColumn) ||
          !Array.isArray(q.rightColumn)
        ) {
          this.logger.warn(
            `Invalid matching question: missing or invalid columns`
          );
          return false;
        }

        if (q.leftColumn.length !== q.rightColumn.length) {
          this.logger.warn(
            `Invalid matching question: column length mismatch (${q.leftColumn.length} vs ${q.rightColumn.length})`
          );
          return false;
        }
      }

      return true;
    });

    if (validQuestions.length === 0) {
      throw new Error('No valid questions found in response');
    }

    if (validQuestions.length < questions.length) {
      this.logger.warn(
        `Filtered out ${questions.length - validQuestions.length} invalid question(s)`
      );
    }

    return validQuestions;
  }

  /**
   * Validate flashcards structure
   */
  private validateFlashcards(cards: any[]): Flashcard[] {
    if (!Array.isArray(cards)) {
      throw new TypeError('Invalid cards format: expected array');
    }

    const validCards = cards.filter((card) => card.front && card.back);

    if (validCards.length === 0) {
      throw new Error('No valid flashcards found in response');
    }

    if (validCards.length < cards.length) {
      this.logger.warn(
        `Filtered out ${cards.length - validCards.length} invalid card(s)`
      );
    }

    return validCards;
  }

  /**
   * Build cache key for quiz generation
   */
  private buildQuizCacheKey(
    topic: string | undefined,
    numberOfQuestions: number,
    difficulty: string,
    quizType: string,
    questionTypes: string[]
  ): string {
    return `quiz:${topic}:${numberOfQuestions}:${difficulty}:${quizType}:${questionTypes.join(',')}`;
  }

  /**
   * Build cache key for file-based generation
   */
  private buildFileCacheKey(
    fileReferences: FileReference[],
    params: {
      type: 'quiz' | 'flashcard' | 'learning_material';
      numberOfItems: number;
      difficulty?: string;
      quizType?: string;
    }
  ): string {
    // Sort file IDs for consistent hashing
    const fileIds = fileReferences
      .map((f) => f.googleFileId || f.googleFileUrl || f.originalname)
      .filter(Boolean)
      .sort()
      .join(':');

    // Create hash of file references
    const fileHash = createHash('md5')
      .update(fileIds)
      .digest('hex')
      .substring(0, 16); // First 16 chars

    // Build cache key with file hash and params
    const { type, numberOfItems, difficulty, quizType } = params;

    if (type === 'quiz') {
      return `quiz:file:${fileHash}:${numberOfItems}:${difficulty}:${quizType || 'standard'}`;
    } else if (type === 'flashcard') {
      return `flashcard:file:${fileHash}:${numberOfItems}`;
    } else {
      // learning_material
      return `learning_guide:file:${fileHash}`;
    }
  }

  /**
   * Build question type instructions for prompt
   */
  private buildQuestionTypeInstructions(questionTypes: string[]): string {
    const instructions: string[] = [];

    if (questionTypes.includes('true-false')) {
      instructions.push(
        '- True/False: Statement questions with True or False options'
      );
    }
    if (questionTypes.includes('single-select')) {
      instructions.push(
        '- Single-select: Multiple choice with one correct answer (4 options)'
      );
    }
    if (questionTypes.includes('multi-select')) {
      instructions.push(
        '- Multi-select: Multiple choice with multiple correct answers (4 options)'
      );
    }
    if (questionTypes.includes('matching')) {
      instructions.push(
        '- Matching: Match items from left column to right column (3-5 pairs)'
      );
    }
    if (questionTypes.includes('fill-blank')) {
      instructions.push(
        '- Fill-in-the-blank: Complete the sentence or phrase with the correct answer. Provide multiple correct answers as an array if applicable.'
      );
    }

    return instructions.join('\n');
  }

  /**
   * Build quiz type context for prompt
   */
  private buildQuizTypeContext(quizType: string): string {
    switch (quizType) {
      case 'timed':
        return '(This quiz will be timed, so questions should be clear and focused)';
      case 'scenario':
        return '(Questions should be scenario-based with real-world context and applications)';
      default:
        return '(Standard quiz format)';
    }
  }

  /**
   * Get item from cache with error handling
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      return (await this.cacheManager.get(key)) as T | null;
    } catch (error) {
      this.logger.warn(`Cache retrieval failed for ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Set item in cache with error handling
   */
  private async setCache(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const cacheTTL = ttl || this.CACHE_TTLS.GENERIC_CONTENT; // Default to 1 hour
      await this.cacheManager.set(key, value, cacheTTL);
      this.logger.debug(`Cached result: ${key} (TTL: ${cacheTTL}ms)`);
    } catch (error) {
      this.logger.warn(`Cache storage failed for ${key}:`, error.message);
      // Non-critical error, continue execution
    }
  }
}
