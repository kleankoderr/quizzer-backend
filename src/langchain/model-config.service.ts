import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Simplified Model Configuration Service
 * Uses only Gemini models for all AI generation tasks
 */
@Injectable()
export class ModelConfigService {
  private readonly logger = new Logger(ModelConfigService.name);
  private model: BaseChatModel | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Returns a singleton instance with optimized configuration
   */
  getModel(): BaseChatModel {
    if (this.model) {
      return this.model;
    }

    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    const model = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-2.5-flash'
    );

    if (!apiKey) {
      const error =
        'GOOGLE_API_KEY is not configured. Please set it in your environment variables.';
      this.logger.error(error);
      throw new Error(error);
    }

    this.logger.log(`Initializing Gemini ${model} model with optimizations`);

    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      model,
      temperature: 1,
    });

    this.logger.log(`Gemini ${model} model initialized successfully`);

    return this.model;
  }
}
