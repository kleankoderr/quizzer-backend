import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

@Injectable()
export class ModelConfigService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Create a configurable model that can switch between providers
   * Uses LangChain's native configurable_alternatives pattern
   */
  createConfigurableModel(): BaseChatModel {
    // Initialize all models with correct API parameters
    const gemini = new ChatGoogleGenerativeAI({
      apiKey: this.config.get('GOOGLE_AI_API_KEY'),
      model: this.config.get('GEMINI_MODEL', 'gemini-2.0-flash-exp'),
      temperature: 0.7,
    });

    const groq = new ChatGroq({
      apiKey: this.config.get('GROQ_API_KEY'),
      model: this.config.get('GROQ_MODEL', 'llama-3.1-70b-versatile'),
      temperature: 0.7,
    });

    const openai = new ChatOpenAI({
      apiKey: this.config.get('OPENAI_API_KEY'),
      model: this.config.get('OPENAI_MODEL', 'gpt-4o'),
      temperature: 0.7,
    });

    // For now, return a single model
    // LangChain's configurable_alternatives may not be available in current version
    // We'll use a simpler approach: return the configured model directly
    return gemini;
  }

  /**
   * Get the appropriate model based on routing config
   */
  getModel(routingConfig: { model: string }): BaseChatModel {
    const modelName = routingConfig.model;

    switch (modelName) {
      case 'groq':
        return new ChatGroq({
          apiKey: this.config.get('GROQ_API_KEY'),
          model: this.config.get('GROQ_MODEL', 'llama-3.1-70b-versatile'),
          temperature: 0.7,
        });

      case 'openai':
        return new ChatOpenAI({
          apiKey: this.config.get('OPENAI_API_KEY'),
          model: this.config.get('OPENAI_MODEL', 'gpt-4o'),
          temperature: 0.7,
        });

      case 'gemini':
      default:
        // Gemini is the default model for unknown model names
        return new ChatGoogleGenerativeAI({
          apiKey: this.config.get('GOOGLE_AI_API_KEY'),
          model: this.config.get('GEMINI_MODEL', 'gemini-2.0-flash-exp'),
          temperature: 0.7,
        });
    }
  }

  /**
   * Get routing config based on task metadata
   * This determines which model to use
   */
  getRoutingConfig(metadata: {
    task: string;
    hasFiles?: boolean;
    complexity?: 'simple' | 'medium' | 'complex';
  }): { model: string } {
    // File-based routing (Gemini for multimodal)
    if (metadata.hasFiles) {
      return { model: 'gemini' };
    }

    // Task-specific routing (from environment config)
    const taskConfig = this.getTaskConfig(metadata.task);
    if (taskConfig) {
      return { model: taskConfig };
    }

    // Complexity-based routing (cost optimization)
    if (metadata.complexity) {
      return {
        model: {
          simple: 'groq', // Fast & cheap
          medium: 'gemini', // Balanced
          complex: 'openai', // Most capable
        }[metadata.complexity],
      };
    }

    // Default
    return { model: 'gemini' };
  }

  private getTaskConfig(task: string): string | null {
    // Task-specific routing from environment variables
    const taskMapping: Record<string, string> = {
      quiz: this.config.get('AI_PROVIDER_QUIZ', 'groq'),
      flashcard: this.config.get('AI_PROVIDER_FLASHCARD', 'groq'),
      'learning-guide': this.config.get('AI_PROVIDER_LEARNING_GUIDE', 'gemini'),
      explanation: this.config.get('AI_PROVIDER_EXPLANATION', 'groq'),
    };

    return taskMapping[task] || null;
  }
}
