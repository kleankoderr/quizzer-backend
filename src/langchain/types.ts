export type AIProvider = 'gemini' | 'groq' | 'openai';
export type ModelComplexity = 'simple' | 'medium' | 'complex';

export interface AIModelSettings {
  modelName: string;
  temperature: number;
  maxTokens?: number;
}

export interface AIProviderConfig {
  defaultModel: string;
  models: Record<string, AIModelSettings>;
}

export interface AIModelStrategy {
  providers: Record<AIProvider, AIProviderConfig>;
  routing: {
    defaultProvider: AIProvider;
    taskRouting?: Record<string, AIProvider>;
    complexityRouting?: {
      [key in ModelComplexity]?: AIProvider;
    };
    multimodalProvider?: AIProvider;
  };
}

export interface ModelRoutingOptions {
  task?: string;
  complexity?: ModelComplexity;
  hasFiles?: boolean;
  excludeModels?: string[];
}
