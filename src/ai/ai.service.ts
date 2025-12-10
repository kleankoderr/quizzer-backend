import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AiPrompts } from './ai.prompts';

export interface QuizQuestion {
  questionType:
    | 'true-false'
    | 'single-select'
    | 'multi-select'
    | 'matching'
    | 'fill-blank';
  question: string;
  options?: string[];
  correctAnswer: number | number[] | string | { [key: string]: string };
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

const CACHE_TTL_MS = 3600000; // 1 hour
const GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = 0.7;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: any;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: DEFAULT_TEMPERATURE,
      },
    });

    this.logger.log(`Initialized AI service with model: ${GEMINI_MODEL}`);
  }

  /**
   * Generate quiz questions from topic, content, or file references
   */
  async generateQuiz(
    params: QuizGenerationParams
  ): Promise<{ questions: QuizQuestion[]; title: string; topic: string }> {
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

    // Check cache and build prompt parts in parallel
    const shouldCache = !fileReferences || fileReferences.length === 0;

    const [cached, questionTypeInstructions, quizTypeContext] =
      await Promise.all([
        shouldCache
          ? this.getFromCache<any>(
              this.buildQuizCacheKey(
                topic,
                numberOfQuestions,
                difficulty,
                quizType,
                questionTypes
              )
            )
          : Promise.resolve(null),
        Promise.resolve(this.buildQuestionTypeInstructions(questionTypes)),
        Promise.resolve(this.buildQuizTypeContext(quizType)),
      ]);

    if (cached) {
      this.logger.debug(`Cache hit for quiz generation`);
      return cached;
    }

    // Build prompt
    const prompt = AiPrompts.generateQuiz(
      topic || '',
      numberOfQuestions,
      difficulty,
      `${quizType} ${quizTypeContext}`,
      questionTypeInstructions,
      content || ''
    );

    // Generate with Gemini
    const result = await this.generateWithGemini(prompt, fileReferences);

    // Parse and validate
    const parsed = this.parseJsonResponse<any>(result, 'quiz');
    const finalResult = {
      title: parsed.title || `${topic || 'Quiz'} - ${difficulty}`,
      topic: parsed.topic || topic || 'General Knowledge',
      questions: this.validateQuizQuestions(parsed.questions),
    };

    // Cache if applicable (fire and forget)
    if (shouldCache) {
      const cacheKey = this.buildQuizCacheKey(
        topic,
        numberOfQuestions,
        difficulty,
        quizType,
        questionTypes
      );
      this.setCache(cacheKey, finalResult).catch((err) =>
        this.logger.warn(`Cache write failed: ${err.message}`)
      );
    }

    return finalResult;
  }

  /**
   * Generate flashcards from topic, content, or file references
   */
  async generateFlashcards(
    params: FlashcardGenerationParams
  ): Promise<{ cards: Flashcard[]; title: string; topic: string }> {
    const { topic, content, fileReferences, numberOfCards } = params;

    // Validate input
    this.validateGenerationInput(topic, content, fileReferences, 'flashcards');

    // OPTIMIZATION: Check cache in parallel with prompt building
    const shouldCache = !fileReferences || fileReferences.length === 0;
    const cacheKey = `flashcards:${topic}:${numberOfCards}`;

    const [cached, prompt] = await Promise.all([
      shouldCache ? this.getFromCache<any>(cacheKey) : Promise.resolve(null),
      Promise.resolve(
        AiPrompts.generateFlashcards(topic || '', numberOfCards, content || '')
      ),
    ]);

    if (cached) {
      this.logger.debug(`Cache hit for flashcards: ${cacheKey}`);
      return cached;
    }

    // Generate with Gemini
    const result = await this.generateWithGemini(prompt, fileReferences);

    // Parse and validate
    const parsed = this.parseJsonResponse<any>(result, 'flashcards');
    const finalResult = {
      title: parsed.title || `${topic || 'Flashcards'}`,
      topic: parsed.topic || topic || 'Study Cards',
      cards: this.validateFlashcards(parsed.cards),
    };

    // Cache if applicable (fire and forget)
    if (shouldCache) {
      this.setCache(cacheKey, finalResult).catch((err) =>
        this.logger.warn(`Cache write failed: ${err.message}`)
      );
    }

    return finalResult;
  }

  /**
   * Generate personalized recommendations based on user performance
   */
  async generateRecommendations(
    params: RecommendationParams
  ): Promise<Array<{ topic: string; reason: string; priority: string }>> {
    const { weakTopics, recentAttempts } = params;

    // OPTIMIZATION: Build cache key and prompt in parallel with cache check
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
    const result = await this.generateWithGemini(prompt);

    // Parse response
    try {
      const parsed = this.parseJsonResponse<any[]>(result, 'recommendations');
      // Fire and forget cache write
      this.setCache(cacheKey, parsed).catch(() => {});
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse recommendations:', error.stack);
      return []; // Return empty array on failure
    }
  }

  /**
   * Generate a structured learning guide
   */
  async generateLearningGuide(params: LearningGuideParams): Promise<any> {
    const { topic, content } = params;

    // Build cache key
    const contentHash = content
      ? Buffer.from(content).toString('base64').substring(0, 20)
      : 'no-content';
    const cacheKey = `learning-guide:${topic}:${contentHash}`;

    // Check cache in parallel with prompt building
    const [cached, prompt] = await Promise.all([
      this.getFromCache<any>(cacheKey),
      Promise.resolve(
        AiPrompts.generateLearningGuide(topic || '', content || '')
      ),
    ]);

    if (cached) {
      this.logger.debug(`Cache hit for learning guide: ${cacheKey}`);
      return cached;
    }

    // Generate with Gemini
    const result = await this.generateWithGemini(prompt);

    // Parse and cache (fire and forget)
    const parsed = this.parseJsonResponse<any>(result, 'learning guide');
    this.setCache(cacheKey, parsed).catch(() => {});

    return parsed;
  }

  /**
   * Generate a simpler explanation for a concept
   */
  async generateExplanation(params: ExplanationParams): Promise<string> {
    const { topic, context } = params;
    const prompt = AiPrompts.generateExplanation(topic, context);
    return this.generateContent({ prompt });
  }

  /**
   * Generate more examples for a concept
   */
  async generateExample(params: ExplanationParams): Promise<string> {
    const { topic, context } = params;
    const prompt = AiPrompts.generateExample(topic, context);
    return this.generateContent({ prompt });
  }

  /**
   * Generate content from file references
   */
  async generateContentFromFiles(
    fileReferences: FileReference[]
  ): Promise<string> {
    if (!fileReferences || fileReferences.length === 0) {
      throw new Error('At least one file reference is required');
    }

    const prompt = AiPrompts.generateContentFromFiles(
      'Analyze the uploaded file(s) and generate comprehensive study material.'
    );

    return this.generateWithGemini(prompt, fileReferences);
  }

  /**
   * Generate content from topic with optional source content
   */
  async generateContentFromTopic(
    topic: string,
    sourceContent?: string
  ): Promise<string> {
    const prompt = AiPrompts.generateContent(topic, sourceContent);
    return this.generateContent({ prompt, maxTokens: 2000 });
  }

  /**
   * Extract title from generated content
   */
  async extractTitle(content: string): Promise<string> {
    const prompt = AiPrompts.extractTitle(content);
    const title = await this.generateContent({ prompt, maxTokens: 50 });
    return title.trim();
  }

  /**
   * Extract topic from text
   */
  async extractTopic(text: string): Promise<string> {
    const prompt = AiPrompts.extractTopic(text);
    const topic = await this.generateContent({ prompt, maxTokens: 20 });
    return topic.trim();
  }

  /**
   * Generate generic content using AI
   */
  async generateContent(params: ContentGenerationParams): Promise<string> {
    const { prompt, maxTokens } = params;

    // Build cache key
    const promptHash = Buffer.from(prompt).toString('base64').substring(0, 50);
    const cacheKey = `content:${promptHash}`;

    // Check cache in parallel with preparing generation config
    const cached = await this.getFromCache<string>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for content: ${cacheKey}`);
      return cached;
    }

    // Generate with optional token limit
    let result: { response: any };
    if (maxTokens) {
      result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
        },
      });
    } else {
      result = await this.model.generateContent(prompt);
    }

    const response = await result.response;
    const text = response.text();

    // Cache result (fire and forget)
    this.setCache(cacheKey, text).catch(() => {});

    return text;
  }

  /**
   * Generate content with Gemini, optionally including file references
   */
  private async generateWithGemini(
    prompt: string,
    fileReferences?: FileReference[]
  ): Promise<string> {
    try {
      const parts = this.buildGeminiRequestParts(fileReferences, prompt);
      const result = await this.model.generateContent(parts);
      const response = await result.response;
      return response.text();
    } catch (error) {
      this.logger.error('Gemini API call failed:', error.stack);
      throw new Error(
        `AI generation failed: ${error.message || 'Unknown error'}`
      );
    }
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
   * Extract Google File URI from file reference
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
   * Parse JSON response from Gemini
   */
  private parseJsonResponse<T>(responseText: string, context: string): T {
    try {
      // Remove Markdown code blocks if present
      const cleanedResponse = responseText
        .replaceAll(/```json\s*/g, '')
        .replaceAll(/```\s*/g, '')
        .trim();

      return JSON.parse(cleanedResponse);
    } catch (error) {
      this.logger.error(`Failed to parse ${context} response:`, error.stack);
      this.logger.debug('Raw response:', responseText);
      throw new Error(
        `Failed to parse ${context} response: ${error.message || 'Invalid JSON'}`
      );
    }
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
        '- Multi-select: Multiple choice with multiple correct answers (4-6 options)'
      );
    }
    if (questionTypes.includes('matching')) {
      instructions.push(
        '- Matching: Match items from left column to right column (3-5 pairs)'
      );
    }
    if (questionTypes.includes('fill-blank')) {
      instructions.push(
        '- Fill-in-the-blank: Complete the sentence or phrase with the correct answer'
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
  private async setCache(key: string, value: any): Promise<void> {
    try {
      await this.cacheManager.set(key, value, CACHE_TTL_MS);
      this.logger.debug(`Cached result: ${key}`);
    } catch (error) {
      this.logger.warn(`Cache storage failed for ${key}:`, error.message);
      // Non-critical error, continue execution
    }
  }
}
