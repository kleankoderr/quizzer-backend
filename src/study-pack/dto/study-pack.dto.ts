import { IsString, IsOptional } from 'class-validator';

export class CreateStudyPackDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;
}

export class UpdateStudyPackDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;
}

export class MoveItemDto {
  @IsString()
  type: 'quiz' | 'flashcard' | 'content' | 'file';

  @IsString()
  itemId: string;
}

export class StudyPackListItemDto {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    quizzes: number;
    flashcardSets: number;
    contents: number;
    userDocuments: number;
  };
}

/**
 * DTO for quizzes within study pack details
 */
export class QuizInPackDto {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  questionCount: number; // Instead of full questions array
}

/**
 * DTO for flashcard sets within study pack details
 */
export class FlashcardSetInPackDto {
  id: string;
  title: string;
  topic: string;
  createdAt: Date;
  updatedAt: Date;
  cardCount: number; // Instead of full cards array
}

/**
 * DTO for contents within study pack details
 */
export class ContentInPackDto {
  id: string;
  title: string;
  topic: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for user documents within study pack details
 */
export class UserDocumentInPackDto {
  id: string;
  displayName: string;
  uploadedAt: Date;
  createdAt: Date;
}

/**
 * DTO for study pack detail (full version)
 * Used by GET /study-packs/:id endpoint
 */
export class StudyPackDetailDto {
  id: string;
  userId: string;
  title: string;
  description?: string;
  coverImage?: string;
  createdAt: Date;
  updatedAt: Date;
  quizzes: QuizInPackDto[];
  flashcardSets: FlashcardSetInPackDto[];
  contents: ContentInPackDto[];
  userDocuments: UserDocumentInPackDto[];
}
