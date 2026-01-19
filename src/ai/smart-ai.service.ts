import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { GeminiAiService } from './gemini-ai.service';
import { GroqAiService } from './groq-ai.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import {
  QuizGenerationParams,
  QuizGenerationResponse,
  FlashcardGenerationParams,
  FlashcardGenerationResponse,
  RecommendationParams,
  RecommendationResponse,
  FileReference,
  LearningGuideResponse,
  ContentGenerationParams,
  ExplanationParams,
  ExplanationResponse,
  ExampleResponse,
} from './interfaces/ai-service.interface';

@Injectable()
export class SmartAiService implements AiService {
  constructor(
    private readonly geminiService: GeminiAiService,
    private readonly groqService: GroqAiService,
    private readonly platformSettingsService: PlatformSettingsService
  ) {}

  private async getProvider(
    task: string,
    hasFiles: boolean
  ): Promise<AiService> {
    const config = await this.platformSettingsService.getAiProviderConfig();

    //Check specific task config in DB (Absolute Override)
    if (config[task]) {
      return this.resolveProvider(config[task]);
    }

    //Fallback based on files presence (Category Fallback)
    if (hasFiles) {
      return this.resolveProvider(config.files || 'gemini');
    } else {
      return this.resolveProvider(config.content || 'groq');
    }
  }

  private resolveProvider(providerName: string): AiService {
    return providerName?.toLowerCase() === 'gemini'
      ? this.geminiService
      : this.groqService;
  }

  async generateQuiz(
    params: QuizGenerationParams
  ): Promise<QuizGenerationResponse> {
    const hasFiles = !!(
      params.fileReferences && params.fileReferences.length > 0
    );
    const provider = await this.getProvider('quiz', hasFiles);
    return provider.generateQuiz(params);
  }

  async generateFlashcards(
    params: FlashcardGenerationParams
  ): Promise<FlashcardGenerationResponse> {
    const hasFiles = !!(
      params.fileReferences && params.fileReferences.length > 0
    );
    const provider = await this.getProvider('flashcards', hasFiles);
    return provider.generateFlashcards(params);
  }

  async generateRecommendations(
    params: RecommendationParams
  ): Promise<RecommendationResponse[]> {
    const provider = await this.getProvider('recommendations', false);
    return provider.generateRecommendations(params);
  }

  async generateLearningGuideFromInputs(
    topic?: string,
    content?: string,
    fileReferences?: FileReference[]
  ): Promise<LearningGuideResponse> {
    const hasFiles = !!(fileReferences && fileReferences.length > 0);
    const provider = await this.getProvider('learningGuide', hasFiles);
    return provider.generateLearningGuideFromInputs(
      topic,
      content,
      fileReferences
    );
  }

  async generateContent(params: ContentGenerationParams): Promise<string> {
    const provider = await this.getProvider('content', false);
    return provider.generateContent(params);
  }

  async generateExplanation(
    params: ExplanationParams
  ): Promise<ExplanationResponse> {
    const provider = await this.getProvider('explanation', false);
    return provider.generateExplanation(params);
  }

  async generateExample(params: ExplanationParams): Promise<ExampleResponse> {
    const provider = await this.getProvider('example', false);
    return provider.generateExample(params);
  }

  async generateSummary(params: {
    title: string;
    topic: string;
    content: string;
    learningGuide?: any;
  }): Promise<string> {
    const provider = await this.getProvider('summary', false);
    return provider.generateSummary(params);
  }

  async generateStudyMaterialSummary(
    learningGuide: any,
    studyMaterialTitle: string,
    studyMaterialTopic: string
  ): Promise<string> {
    const provider = await this.getProvider('studyMaterialSummary', false);
    return provider.generateStudyMaterialSummary(
      learningGuide,
      studyMaterialTitle,
      studyMaterialTopic
    );
  }
}
