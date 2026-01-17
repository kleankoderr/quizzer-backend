import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import { AIModelSettings, AIModelStrategy, ModelRoutingOptions } from './types';

@Injectable()
export class ModelConfigService {
  private readonly logger = new Logger(ModelConfigService.name);

  // Hardcoded fallback strategy in case DB is empty
  private readonly fallbackStrategy: AIModelStrategy = {
    routing: {
      defaultModel: 'gemini-flash',
      taskOverrides: {
        quiz: 'groq-fast',
        flashcard: 'groq-fast',
        summary: 'groq-fast',
        recommendation: 'groq-fast',
        'study-material': 'gemini-flash',
      },
      complexityOverrides: {
        simple: 'groq-fast',
        medium: 'gemini-flash',
        complex: 'gemini-flash',
      },
    },
    models: {
      'gemini-flash': {
        provider: 'gemini',
        modelName: 'gemini-2.5-flash',
        temperature: 0.7,
      },
      'groq-fast': {
        provider: 'groq',
        modelName: 'llama-3.3-70b-versatile',
        temperature: 0.7,
      },
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly platformSettings: PlatformSettingsService
  ) {}

  /**
   * Get the appropriate model based on routing options and platform settings
   */
  async getModel(options: ModelRoutingOptions): Promise<BaseChatModel> {
    const settings = await this.resolveModelSettings(options);
    return this.instantiateModel(settings);
  }

  /**
   * Resolves the model settings based on strategy
   */
  async resolveModelSettings(
    options: ModelRoutingOptions
  ): Promise<AIModelSettings> {
    const strategy = await this.getStrategy();
    const { task, complexity, hasFiles } = options;

    let modelAlias = strategy.routing.defaultModel;

    // 1. Multimodal priority
    if (hasFiles) {
      modelAlias = this.configService.get('MULTIMODAL_MODEL_ALIAS') || modelAlias;
    }
    // 2. Task-specific override
    else if (task && strategy.routing.taskOverrides[task]) {
      modelAlias = strategy.routing.taskOverrides[task];
    }
    // 3. Complexity-based mapping
    else if (complexity && strategy.routing.complexityOverrides[complexity]) {
      modelAlias = strategy.routing.complexityOverrides[complexity];
    }

    const settings =
      strategy.models[modelAlias] ||
      strategy.models[strategy.routing.defaultModel];

    this.logger.debug(
      `Resolved model: ${modelAlias} (${settings.provider}) for task: ${task || 'none'}`
    );

    return settings;
  }

  private async getStrategy(): Promise<AIModelStrategy> {
    const dbConfig = await this.platformSettings.getAiProviderConfig();

    // If the DB config has the new structure, use it
    if (dbConfig?.routing && dbConfig?.models) {
      return dbConfig as unknown as AIModelStrategy;
    }

    // Otherwise, return fallback
    return this.fallbackStrategy;
  }

  /**
   * Creates the LangChain model instance
   */
  private instantiateModel(settings: AIModelSettings): BaseChatModel {
    const { provider, modelName, temperature } = settings;

    switch (provider) {
      case 'groq':
        return new ChatGroq({
          apiKey: this.configService.get('GROQ_API_KEY'),
          model: modelName,
          temperature,
        });
      case 'gemini':
      default:
        return new ChatGoogleGenerativeAI({
          apiKey: this.configService.get('GOOGLE_AI_API_KEY'),
          model: modelName,
          temperature,
        });
    }
  }
}
