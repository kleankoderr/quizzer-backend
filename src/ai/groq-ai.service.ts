import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/services/cache.service';
import Groq from 'groq-sdk';
import { createHash } from 'node:crypto';
import { AiPrompts } from './ai.prompts';
import {
  QuizGenerationResponse,
  FlashcardGenerationResponse,
  LearningGuideResponse,
  RecommendationResponse,
  ExampleResponse,
  ExplanationResponse,
} from './dto/ai-response.dto';
import {
  QuizGenerationParams,
  FlashcardGenerationParams,
  RecommendationParams,
  ContentGenerationParams,
  ExplanationParams,
  FileReference,
} from './interfaces/ai-service.interface';
import { AiService } from './ai.service';
import JSON5 from 'json5';

// Groq Model Selection
const MODELS = {
  PREMIUM: process.env.GROQ_MODEL_PREMIUM || 'llama-3.3-70b-versatile', // Llama 3.3 70B
  STANDARD: process.env.GROQ_MODEL_STANDARD || 'llama-3.3-70b-versatile', // Llama 3.3 70B
  FAST: process.env.GROQ_MODEL_FAST || 'llama-3.1-8b-instant', // Llama 3.1 8B
};

const MODEL_MAPPING: Record<string, string> = {
  quiz: MODELS.PREMIUM,
  flashcard: MODELS.PREMIUM,
  'learning-guide': MODELS.PREMIUM,
  explanation: MODELS.STANDARD,
  example: MODELS.STANDARD,
  recommendation: MODELS.STANDARD,
  companion: MODELS.FAST,
  content: MODELS.STANDARD,
};

const DEFAULT_TEMPERATURE = 0.5; // Lower temperature for more deterministic JSON

@Injectable()
export class GroqAiService extends AiService {
  private readonly logger = new Logger(GroqAiService.name);
  private readonly groq: Groq;
  private readonly CACHE_TTLS: Record<string, number>;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService
  ) {
    super();
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    this.groq = new Groq({ apiKey });

    this.CACHE_TTLS = {
      QUIZ_TOPIC: this.configService.get<number>(
        'CACHE_TTL_QUIZ_TOPIC_MS',
        86400000
      ),
      QUIZ_FILE: this.configService.get<number>(
        'CACHE_TTL_QUIZ_FILE_MS',
        86400000
      ),
      FLASHCARD_TOPIC: this.configService.get<number>(
        'CACHE_TTL_FLASHCARD_TOPIC_MS',
        86400000
      ),
      FLASHCARD_FILE: this.configService.get<number>(
        'CACHE_TTL_FLASHCARD_FILE_MS',
        86400000
      ),
      LEARNING_GUIDE: this.configService.get<number>(
        'CACHE_TTL_LEARNING_GUIDE_MS',
        43200000
      ),
      EXPLANATION: this.configService.get<number>(
        'CACHE_TTL_EXPLANATION_MS',
        43200000
      ),
      EXAMPLE: this.configService.get<number>('CACHE_TTL_EXAMPLE_MS', 43200000),
      RECOMMENDATION: this.configService.get<number>(
        'CACHE_TTL_RECOMMENDATION_MS',
        1800000
      ),
      COMPANION: this.configService.get<number>(
        'CACHE_TTL_COMPANION_MS',
        3600000
      ),
      GENERIC_CONTENT: this.configService.get<number>(
        'CACHE_TTL_GENERIC_CONTENT_MS',
        3600000
      ),
    };

    this.logger.log('Initialized AI service with Groq');
  }

  private getModelForTask(taskType: string): string {
    const model = MODEL_MAPPING[taskType] || MODELS.STANDARD;
    this.logger.debug(`Selected usage model ${model} for task: ${taskType}`);
    return model;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.cacheService.get<string>(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      this.logger.warn(`Cache read failed: ${error.message}`);
      return null;
    }
  }

  private async setCache(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.cacheService.set(key, JSON.stringify(value), ttl);
    } catch (error) {
      this.logger.warn(`Cache write failed: ${error.message}`);
    }
  }

  private generateCacheKey(prefix: string, data: any): string {
    return `${prefix}:${createHash('md5').update(JSON.stringify(data)).digest('hex')}`;
  }

  private async parseJsonResponse<T>(
    content: string,
    context: string
  ): Promise<T> {
    try {
      return JSON5.parse(content);
    } catch {
      try {
        const match = new RegExp(/```(?:json)?\s*([\s\S]*?)\s*```/).exec(
          content
        );
        if (match) {
          return JSON5.parse(match[1]);
        }

        const firstOpen = content.indexOf('{');
        const firstRun = content.indexOf('[');
        const start =
          firstOpen > -1 && firstRun > -1
            ? Math.min(firstOpen, firstRun)
            : Math.max(firstOpen, firstRun);

        const lastClose = content.lastIndexOf('}');
        const lastSquare = content.lastIndexOf(']');
        const end = Math.max(lastClose, lastSquare);

        if (start > -1 && end > start) {
          return JSON5.parse(content.substring(start, end + 1));
        }

        throw new Error('No JSON found in response');
      } catch (error) {
        this.logger.error(
          `Failed to parse JSON for ${context}: ${content.substring(0, 200)}...`,
          error
        );
        throw new Error('Failed to parse AI response');
      }
    }
  }

  private async generateWithGroq(
    model: string,
    prompt: string,
    context: string,
    systemPrompt?: string
  ): Promise<string> {
    try {
      const messages: any[] = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const completion = await this.groq.chat.completions.create({
        messages,
        model,
        temperature: DEFAULT_TEMPERATURE,
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error(`Groq API failed for ${context}:`, error);
      throw new Error('AI service temporarily unavailable');
    }
  }

  async generateQuiz(
    params: QuizGenerationParams
  ): Promise<QuizGenerationResponse> {
    const {
      topic,
      content,
      fileReferences,
      numberOfQuestions,
      difficulty,
      quizType,
      questionTypes,
    } = params;

    const cacheKey = this.generateCacheKey('quiz', {
      topic,
      numberOfQuestions,
      difficulty,
      quizType,
      questionTypes,
      content,
    });

    const cached = await this.getFromCache<QuizGenerationResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for quiz: ${cacheKey}`);
      return cached;
    }

    const finalContent = content || '';
    if (fileReferences && fileReferences.length > 0) {
      this.logger.warn(
        'GroqAiService received file references. Ignoring files for Groq generation.'
      );
    }

    const prompt = AiPrompts.generateQuiz(
      topic || '',
      numberOfQuestions,
      difficulty,
      String(quizType),
      String(questionTypes),
      finalContent
    );

    const model = this.getModelForTask('quiz');
    const result = await this.generateWithGroq(
      model,
      prompt,
      'quiz',
      'You are a JSON-only API. return strictly valid JSON.'
    );
    const parsed = await this.parseJsonResponse<QuizGenerationResponse>(
      result,
      'quiz'
    );

    await this.setCache(cacheKey, parsed, this.CACHE_TTLS.QUIZ_TOPIC);
    return parsed;
  }

  async generateFlashcards(
    params: FlashcardGenerationParams
  ): Promise<FlashcardGenerationResponse> {
    const { topic, content, numberOfCards, fileReferences } = params;

    const cacheKey = this.generateCacheKey('flashcard', {
      topic,
      numberOfCards,
      content,
    });

    const cached =
      await this.getFromCache<FlashcardGenerationResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for flashcards: ${cacheKey}`);
      return cached;
    }

    const finalContent = content || '';
    if (fileReferences && fileReferences.length > 0) {
      this.logger.warn(
        'GroqAiService received file references. Ignoring files for Flashcard generation.'
      );
    }

    const prompt = AiPrompts.generateFlashcards(
      topic || '',
      numberOfCards,
      finalContent
    );
    const model = this.getModelForTask('flashcard');
    const result = await this.generateWithGroq(
      model,
      prompt,
      'flashcard',
      'You are a JSON-only API. return strictly valid JSON.'
    );

    const parsed = await this.parseJsonResponse<FlashcardGenerationResponse>(
      result,
      'flashcard'
    );

    await this.setCache(cacheKey, parsed, this.CACHE_TTLS.FLASHCARD_TOPIC);
    return parsed;
  }

  async generateRecommendations(
    params: RecommendationParams
  ): Promise<RecommendationResponse[]> {
    const { weakTopics, recentAttempts } = params;
    const cacheKey = this.generateCacheKey('recommendation', {
      weakTopics,
      recentAttempts,
    });

    const cached = await this.getFromCache<RecommendationResponse[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for recommendations: ${cacheKey}`);
      return cached;
    }

    const prompt = AiPrompts.generateRecommendations(
      weakTopics,
      recentAttempts
    );
    const model = this.getModelForTask('recommendation');

    const result = await this.generateWithGroq(
      model,
      prompt,
      'recommendation',
      'You are a JSON-only API. return strictly valid JSON.'
    );
    const parsed = await this.parseJsonResponse<RecommendationResponse[]>(
      result,
      'recommendation'
    );

    await this.setCache(cacheKey, parsed, this.CACHE_TTLS.RECOMMENDATION);
    return parsed;
  }

  async generateLearningGuideFromInputs(
    topic?: string,
    content?: string,
    _fileReferences?: FileReference[]
  ): Promise<LearningGuideResponse> {
    const cacheKey = this.generateCacheKey('learning-guide', {
      topic,
      content,
    });

    const cached = await this.getFromCache<LearningGuideResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for learning guide: ${cacheKey}`);
      return cached;
    }

    const finalContent = content || '';
    if (_fileReferences && _fileReferences.length > 0) {
      this.logger.warn(
        'GroqAiService received file references. Ignoring files for Learning Guide generation.'
      );
    }

    const prompt = AiPrompts.generateComprehensiveLearningGuide(
      topic || '',
      finalContent
    );
    const model = this.getModelForTask('learning-guide');
    const result = await this.generateWithGroq(
      model,
      prompt,
      'learning-guide',
      'You are a JSON-only API. return strictly valid JSON.'
    );
    const parsed = await this.parseJsonResponse<LearningGuideResponse>(
      result,
      'learning-guide'
    );

    await this.setCache(cacheKey, parsed, this.CACHE_TTLS.LEARNING_GUIDE);
    return parsed;
  }

  async generateContent(params: ContentGenerationParams): Promise<string> {
    const { prompt } = params;
    const cacheKey = this.generateCacheKey('content', prompt);

    const cached = await this.getFromCache<string>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for content: ${cacheKey}`);
      return cached;
    }

    const model = this.getModelForTask('content');
    const result = await this.generateWithGroq(model, prompt, 'content');

    await this.setCache(cacheKey, result, this.CACHE_TTLS.GENERIC_CONTENT);
    return result;
  }

  async generateExplanation(
    params: ExplanationParams
  ): Promise<ExplanationResponse> {
    const { topic, context } = params;
    const cacheKey = this.generateCacheKey('explanation', { topic, context });

    const cached = await this.getFromCache<ExplanationResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for explanation: ${cacheKey}`);
      return cached;
    }

    const prompt = AiPrompts.generateExplanation(topic, context);
    const model = this.getModelForTask('explanation');
    const text = await this.generateWithGroq(model, prompt, 'explanation');

    const response = { explanation: text };
    await this.setCache(cacheKey, response, this.CACHE_TTLS.EXPLANATION);
    return response;
  }

  async generateExample(params: ExplanationParams): Promise<ExampleResponse> {
    const { topic, context } = params;
    const cacheKey = this.generateCacheKey('example', { topic, context });

    const cached = await this.getFromCache<ExampleResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for example: ${cacheKey}`);
      return cached;
    }

    const prompt = AiPrompts.generateExample(topic, context);
    const model = this.getModelForTask('example');
    const text = await this.generateWithGroq(model, prompt, 'example');

    const response = { examples: text };
    await this.setCache(cacheKey, response, this.CACHE_TTLS.EXAMPLE);
    return response;
  }

  async generateSummary(params: {
    title: string;
    topic: string;
    content: string;
    learningGuide?: any;
  }): Promise<string> {
    const { title, topic, content, learningGuide } = params;
    const cacheKey = this.generateCacheKey('summary', {
      title,
      topic,
      content,
      learningGuide,
    });

    const cached = await this.getFromCache<string>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for summary: ${cacheKey}`);
      return cached;
    }

    const prompt = AiPrompts.generateSummary(
      title,
      topic,
      content,
      learningGuide
    );
    const model = this.getModelForTask('content');
    const result = await this.generateWithGroq(model, prompt, 'summary');

    await this.setCache(cacheKey, result, this.CACHE_TTLS.LEARNING_GUIDE);
    return result;
  }

  async generateStudyMaterialSummary(
    learningGuide: any,
    studyMaterialTitle: string,
    studyMaterialTopic: string
  ): Promise<string> {
    return this.generateSummary({
      title: studyMaterialTitle,
      topic: studyMaterialTopic,
      content: '',
      learningGuide,
    });
  }
}
