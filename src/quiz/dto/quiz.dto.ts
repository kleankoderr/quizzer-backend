import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export type QuizType = 'standard' | 'timed' | 'scenario';
export type QuestionType =
  | 'true-false'
  | 'single-select'
  | 'multi-select'
  | 'matching'
  | 'fill-blank';

export class GenerateQuizDto {
  @ApiProperty({
    required: false,
    description: 'Topic for the quiz',
    example: 'Basic Math',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @ApiProperty({ required: false, description: 'Content for the quiz' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  content?: string;

  @ApiProperty({ required: false, description: 'Content ID for the quiz' })
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiProperty({ description: 'Number of questions for the quiz', example: 5 })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(3)
  @Max(50)
  numberOfQuestions: number;

  @ApiProperty({
    description: 'Difficulty level of the quiz',
    example: 'medium',
    enum: ['easy', 'medium', 'hard'],
  })
  @IsEnum(['easy', 'medium', 'hard'])
  difficulty: 'easy' | 'medium' | 'hard';

  @ApiProperty({
    required: false,
    description: 'Type of the quiz',
    example: 'standard',
    enum: ['standard', 'timed', 'scenario'],
  })
  @IsOptional()
  @IsEnum(['standard', 'timed', 'scenario'])
  quizType?: QuizType;

  @ApiProperty({
    required: false,
    description: 'IDs of selected files for quiz generation',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedFileIds?: string[];

  @ApiProperty({
    required: false,
    description: 'Time limit in seconds for timed quizzes',
  })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(60)
  @Max(7200)
  timeLimit?: number; // Time limit in seconds for timed quizzes

  @ApiProperty({
    required: false,
    description: 'Types of questions for the quiz',
  })
  @IsArray()
  @IsEnum(
    ['true-false', 'single-select', 'multi-select', 'matching', 'fill-blank'],
    { each: true }
  )
  questionTypes?: QuestionType[];

  @ApiProperty({ required: false, description: 'Study pack Id' })
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

export class QuizListItemDto {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  quizType: string;
  timeLimit?: number;
  createdAt: Date;
  questionCount: number; // Instead of full questions array
  attemptCount?: number; // Instead of full attempts array
  studyPack?: {
    id: string;
    title: string;
  };
}

export class QuizDetailDto extends QuizListItemDto {
  questions: any[]; // Full questions array for detail view
  userId: string;
  tags?: string[];
  contentId?: string;
  studyPackId?: string;
  sourceFiles?: string[];
}

export class QuizSubmissionResultDto {
  attemptId: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  correctAnswers: any[];
  feedback: {
    message: string;
    percentile?: number;
  };
}
