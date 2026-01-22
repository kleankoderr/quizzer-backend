import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import {
  AIModelStrategy,
  AIModelSettings,
  ModelRoutingOptions,
  AIProvider,
} from './types';

@Injectable()
export class ModelConfigService {
  private readonly logger = new Logger(ModelConfigService.name);

  // Fallback strategy if DB config is missing
  private readonly fallbackStrategy: AIModelStrategy = {
    providers: {
      groq: {
        defaultModel: 'fast',
        models: {
          fast: {
            modelName: 'llama-3.3-70b-versatile',
            temperature: 0.7,
          },
        },
      },
      gemini: {
        defaultModel: 'flash',
        models: {
          flash: {
            modelName: 'gemini-2.5-flash',
            temperature: 0.7,
          },
          pro: {
            modelName: 'gemini-2.5-pro',
            temperature: 0.5,
          },
        },
      },
      openai: {
        defaultModel: 'gpt4',
        models: {
          gpt4: {
            modelName: 'gpt-4',
            temperature: 0.7,
          },
        },
      },
    },
    routing: {
      defaultProvider: 'gemini',
      taskRouting: {
        quiz: 'gemini',
        summary: 'gemini',
        flashcard: 'gemini',
        recommendation: 'groq',
        'study-material': 'gemini',
      },
      complexityRouting: {
        simple: 'groq',
        medium: 'gemini',
        complex: 'gemini',
      },
      multimodalProvider: 'gemini',
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly platformSettings: PlatformSettingsService
  ) {}

  async getModel(options: ModelRoutingOptions): Promise<BaseChatModel> {
    const resolved = await this.resolveModelSettings(options);
    return this.instantiateModel(resolved);
  }

  private async resolveModelSettings(
    options: ModelRoutingOptions
  ): Promise<AIModelSettings & { provider: AIProvider; modelKey: string }> {
    const strategy = await this.getStrategy();
    const { task, complexity, hasFiles } = options;

    let provider: AIProvider = strategy.routing.defaultProvider;

    if (hasFiles && strategy.routing.multimodalProvider) {
      provider = strategy.routing.multimodalProvider;
    } else if (task && strategy.routing.taskRouting?.[task]) {
      provider = strategy.routing.taskRouting[task];
    } else if (complexity && strategy.routing.complexityRouting?.[complexity]) {
      provider = strategy.routing.complexityRouting[complexity];
    }

    const providerConfig = strategy.providers[provider];
    const modelKey = providerConfig.defaultModel;
    const modelSettings = providerConfig.models[modelKey];

    this.logger.debug(
      `AI routing → provider=${provider}, model=${modelKey}, task=${task ?? 'none'}, complexity=${complexity ?? 'none'}`
    );

    return {
      provider,
      modelKey,
      ...modelSettings,
    };
  }

  private async getStrategy(): Promise<AIModelStrategy> {
    const dbConfig = await this.platformSettings.getAiProviderConfig();

    if (dbConfig?.providers && dbConfig?.routing) {
      return dbConfig;
    }

    return this.fallbackStrategy;
  }

  private instantiateModel(
    settings: AIModelSettings & { provider: AIProvider }
  ): BaseChatModel {
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
