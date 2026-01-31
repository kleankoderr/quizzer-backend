import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { GenerateQuizDto } from '../../dto/quiz.dto';
import { ContentScope } from '@prisma/client';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminQuizScopedDto {
  @ApiProperty({
    enum: ContentScope,
    description: 'Scope of the content (GLOBAL or SCHOOL)',
  })
  @IsEnum(ContentScope)
  scope: ContentScope;

  @ApiProperty({ required: false, description: 'School ID if scope is SCHOOL' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Whether the quiz is active',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAdminQuizDto extends GenerateQuizDto {
  @ApiProperty({
    enum: ContentScope,
    description: 'Scope of the content (GLOBAL or SCHOOL)',
  })
  @IsEnum(ContentScope)
  scope: ContentScope;

  @ApiProperty({ required: false, description: 'School ID if scope is SCHOOL' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Whether the quiz is active',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminQuizDto extends AdminQuizScopedDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object' },
    description: 'Array of quiz questions',
  })
  @IsOptional()
  @IsArray()
  questions?: any[];

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    description: 'Array of question ids to delete',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deletedQuestionIds?: string[];
}

export class DeleteQuestionsDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Array of question ids to delete',
  })
  @IsArray()
  @IsString({ each: true })
  questionIds: string[];
}
