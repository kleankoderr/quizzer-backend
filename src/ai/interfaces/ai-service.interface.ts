import {
  QuizGenerationResponse,
  FlashcardGenerationResponse,
  LearningGuideResponse,
  RecommendationResponse,
  ExplanationResponse,
  ExampleResponse,
} from '../dto/ai-response.dto';

export {
  QuizGenerationResponse,
  FlashcardGenerationResponse,
  LearningGuideResponse,
  RecommendationResponse,
  ExplanationResponse,
  ExampleResponse,
};

export interface QuizQuestion {
  questionType:
    | 'true-false'
    | 'single-select'
    | 'multi-select'
    | 'matching'
    | 'fill-blank';
  question: string;
  options?: string[];
  correctAnswer:
    | number
    | number[]
    | string
    | string[]
    | { [key: string]: string };
  explanation?: string;
  leftColumn?: string[];
  rightColumn?: string[];
  citation?: string;
}

export interface Flashcard {
  front: string;
  back: string;
  explanation?: string;
}

export interface FileReference {
  googleFileUrl?: string;
  googleFileId?: string;
  originalname: string;
  mimetype?: string;
  cloudinaryUrl?: string;
  url?: string;
}

export interface QuizGenerationParams {
  topic?: string;
  content?: string;
  fileReferences?: FileReference[];
  numberOfQuestions: number;
  difficulty: 'easy' | 'medium' | 'hard';
  quizType?: 'standard' | 'timed' | 'scenario';
  questionTypes?: (
    | 'true-false'
    | 'single-select'
    | 'multi-select'
    | 'matching'
    | 'fill-blank'
  )[];
}

export interface FlashcardGenerationParams {
  topic?: string;
  content?: string;
  fileReferences?: FileReference[];
  numberOfCards: number;
}

export interface RecommendationParams {
  weakTopics: string[];
  recentAttempts: any[];
}

export interface ContentGenerationParams {
  prompt: string;
  maxTokens?: number;
}

export interface LearningGuideParams {
  topic?: string;
  content?: string;
}

export interface ExplanationParams {
  topic: string;
  context: string;
}

export interface IAiService {
  generateQuiz(params: QuizGenerationParams): Promise<QuizGenerationResponse>;
  generateFlashcards(
    params: FlashcardGenerationParams
  ): Promise<FlashcardGenerationResponse>;
  generateRecommendations(
    params: RecommendationParams
  ): Promise<RecommendationResponse[]>;
  generateLearningGuideFromInputs(
    topic?: string,
    content?: string,
    fileReferences?: FileReference[]
  ): Promise<LearningGuideResponse>;
  generateContent(params: ContentGenerationParams): Promise<string>;
  generateExplanation(params: ExplanationParams): Promise<ExplanationResponse>;
  generateExample(params: ExplanationParams): Promise<ExampleResponse>;
  generateSummary(params: {
    title: string;
    topic: string;
    content: string;
    learningGuide?: any;
  }): Promise<string>;
  generateStudyMaterialSummary(
    learningGuide: any,
    studyMaterialTitle: string,
    studyMaterialTopic: string
  ): Promise<string>;
}
