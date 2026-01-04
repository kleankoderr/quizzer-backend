import { Injectable } from '@nestjs/common';
import {
  IAiService,
  QuizGenerationParams,
  FlashcardGenerationParams,
  RecommendationParams,
  ContentGenerationParams,
  ExplanationParams,
  FileReference,
} from './interfaces/ai-service.interface';
import {
  QuizGenerationResponse,
  FlashcardGenerationResponse,
  LearningGuideResponse,
  RecommendationResponse,
  ExampleResponse,
  ExplanationResponse,
} from './dto/ai-response.dto';

@Injectable()
export abstract class AiService implements IAiService {
  abstract generateQuiz(
    params: QuizGenerationParams
  ): Promise<QuizGenerationResponse>;
  abstract generateFlashcards(
    params: FlashcardGenerationParams
  ): Promise<FlashcardGenerationResponse>;
  abstract generateRecommendations(
    params: RecommendationParams
  ): Promise<RecommendationResponse[]>;
  abstract generateLearningGuideFromInputs(
    topic?: string,
    content?: string,
    fileReferences?: FileReference[]
  ): Promise<LearningGuideResponse>;
  abstract generateContent(params: ContentGenerationParams): Promise<string>;
  abstract generateExplanation(
    params: ExplanationParams
  ): Promise<ExplanationResponse>;
  abstract generateExample(params: ExplanationParams): Promise<ExampleResponse>;
  abstract generateSummary(params: {
    title: string;
    topic: string;
    content: string;
    learningGuide?: any;
  }): Promise<string>;
  abstract generateStudyMaterialSummary(
    learningGuide: any,
    studyMaterialTitle: string,
    studyMaterialTopic: string
  ): Promise<string>;
}
