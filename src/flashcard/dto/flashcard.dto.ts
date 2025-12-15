import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GenerateFlashcardDto {
  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  contentId?: string;

  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(5)
  @Max(100)
  numberOfCards: number;

  @IsOptional()
  @IsString()
  studyPackId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedFileIds?: string[];
}

export class CardResponseDto {
  @IsInt()
  cardIndex: number;

  @IsString()
  @IsIn(['know', 'dont-know', 'skipped'])
  response: 'know' | 'dont-know' | 'skipped';
}

export class RecordFlashcardSessionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardResponseDto)
  cardResponses: CardResponseDto[];
}

export class FlashcardListItemDto {
  id: string;
  title: string;
  topic: string;
  createdAt: Date;
  cardCount: number; // Instead of full cards array
  lastStudiedAt?: Date;
  studyPack?: {
    id: string;
    title: string;
  };
}

export class FlashcardSetDetailDto extends FlashcardListItemDto {
  cards: any[]; // Full cards array for detail view
  userId: string;
  contentId?: string;
  studyPackId?: string;
  sourceFiles?: string[];
}

export class FlashcardSessionResultDto {
  id: string; // Attempt ID
  userId: string;
  flashcardSetId: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  percentage: number;
  isPerfect: boolean;
  completedAt: Date;
}
