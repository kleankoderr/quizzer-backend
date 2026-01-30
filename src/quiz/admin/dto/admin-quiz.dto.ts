import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { GenerateQuizDto } from '../../dto/quiz.dto';
import { ContentScope } from '@prisma/client';

import { ApiProperty } from '@nestjs/swagger';

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
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminQuizDto extends AdminQuizScopedDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  topic?: string;
}
