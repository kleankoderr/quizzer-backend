/**
 * Simplified types for Gemini 2.5 Flash only configuration
 */

export interface ModelSettings {
  modelName: string;
  temperature: number;
  maxTokens?: number;
}
