import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ContentScope } from '@prisma/client';
import { CreateContentDto } from './content.dto';

/** DTO for queueing admin study material generation (same inputs as user content + scope) */
export class GenerateAdminStudyMaterialDto extends CreateContentDto {
  @ApiProperty({ enum: ContentScope, description: 'GLOBAL or SCHOOL' })
  @IsEnum(ContentScope)
  scope: ContentScope;

  @ApiPropertyOptional({ description: 'School ID when scope is SCHOOL' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({ default: true, description: 'Whether the material is active' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAdminStudyMaterialDto {
  @ApiProperty({ example: 'Introduction to Biology', description: 'Title' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Biology', description: 'Topic' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  topic: string;

  @ApiProperty({
    example: 'Biology is the study of life...',
    description: 'The study material body content',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Short description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: ContentScope, description: 'GLOBAL or SCHOOL' })
  @IsEnum(ContentScope)
  scope: ContentScope;

  @ApiPropertyOptional({ description: 'School ID when scope is SCHOOL' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({ default: true, description: 'Whether the material is active' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminStudyMaterialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ContentScope })
  @IsOptional()
  @IsEnum(ContentScope)
  scope?: ContentScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
