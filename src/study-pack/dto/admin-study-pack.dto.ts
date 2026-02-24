import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ContentScope } from '@prisma/client';

export class CreateAdminStudyPackDto {
  @ApiProperty({ example: 'Biology Fundamentals', description: 'Study pack title' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Optional description' })
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

  @ApiPropertyOptional({ default: true, description: 'Whether the pack is active' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminStudyPackDto {
  @ApiPropertyOptional({ example: 'Biology Fundamentals', description: 'Study pack title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ContentScope, description: 'GLOBAL or SCHOOL' })
  @IsOptional()
  @IsEnum(ContentScope)
  scope?: ContentScope;

  @ApiPropertyOptional({ description: 'School ID when scope is SCHOOL' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({ description: 'Whether the pack is active' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === 1 || value === true) return true;
    if (value === 'false' || value === 0 || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
