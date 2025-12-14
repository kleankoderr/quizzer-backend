import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';

export type QuizType = 'standard' | 'timed' | 'scenario';
export type QuestionType =
  | 'true-false'
  | 'single-select'
  | 'multi-select'
  | 'matching'
  | 'fill-blank';

export class GenerateQuizDto {
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
  @Min(3)
  @Max(50)
  numberOfQuestions: number;

  @IsEnum(['easy', 'medium', 'hard'])
  difficulty: 'easy' | 'medium' | 'hard';

  @IsOptional()
  @IsEnum(['standard', 'timed', 'scenario'])
  quizType?: QuizType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedFileIds?: string[];

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(60)
  @Max(7200)
  timeLimit?: number; // Time limit in seconds for timed quizzes

  @IsOptional()
  @IsArray()
  @IsEnum(
    ['true-false', 'single-select', 'multi-select', 'matching', 'fill-blank'],
    { each: true }
  )
  questionTypes?: QuestionType[];

  @IsOptional()
  @IsString()
  studyPackId?: string;
}

export class SubmitQuizDto {
  @IsArray()
  answers: (number | number[] | string | { [key: string]: string })[];

  @IsOptional()
  @IsString()
  challengeId?: string;
}
