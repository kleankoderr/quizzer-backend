export type AIProvider = 'gemini' | 'groq' | 'openai';
export type ModelComplexity = 'simple' | 'medium' | 'complex';

export interface AIModelSettings {
  provider: AIProvider;
  modelName: string;
  temperature: number;
  maxTokens?: number;
}

export interface AIModelStrategy {
  routing: {
    defaultModel: string; // Key in 'models'
    taskOverrides: Record<string, string>; // task -> Key in 'models'
    complexityOverrides: {
      [key in ModelComplexity]: string; // complexity -> Key in 'models'
    };
  };
  models: Record<string, AIModelSettings>;
}

export interface ModelRoutingOptions {
  task?: string;
  complexity?: ModelComplexity;
  hasFiles?: boolean;
}
