/**
 * AI Response DTOs
 *
 * These DTOs define the structured response format for all AI-generated content.
 * All AI service methods should return these structured objects instead of raw strings.
 */

/**
 * Quiz Generation Response
 */
export interface QuizGenerationResponse {
  title: string;
  topic: string;
  questions: QuizQuestionDto[];
}

export interface QuizQuestionDto {
  questionType:
    | 'true-false'
    | 'single-select'
    | 'multi-select'
    | 'matching'
    | 'fill-blank';
  question: string;
  options?: string[];
  correctAnswer: number | number[] | string | { [key: string]: string };
  explanation?: string;
  leftColumn?: string[];
  rightColumn?: string[];
  citation?: string;
}

/**
 * Flashcard Generation Response
 */
export interface FlashcardGenerationResponse {
  title: string;
  topic: string;
  cards: FlashcardDto[];
}

export interface FlashcardDto {
  front: string;
  back: string;
  explanation?: string;
}

/**
 * Content Generation Response
 */
export interface ContentGenerationResponse {
  title: string;
  sections: ContentSectionDto[];
}

export interface ContentSectionDto {
  title: string;
  content: string;
}

/**
 * Learning Guide Response
 */
export interface LearningGuideResponse {
  overview: string;
  keyConcepts: string[];
  sections: LearningGuideSectionDto[];
  nextSteps: string[];
  [key: string]: any; // Index signature for Prisma JSON compatibility
}

export interface LearningGuideSectionDto {
  title: string;
  content: string;
  example?: string;
}

/**
 * Recommendation Response
 */
export interface RecommendationResponse {
  topic: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Title Extraction Response
 */
export interface TitleExtractionResponse {
  title: string;
}

/**
 * Topic Extraction Response
 */
export interface TopicExtractionResponse {
  topic: string;
}

/**
 * Explanation Response (Markdown formatted)
 */
export interface ExplanationResponse {
  explanation: string; // Markdown formatted text
}

/**
 * Example Response (Markdown formatted)
 */
export interface ExampleResponse {
  examples: string; // Markdown formatted text
}
