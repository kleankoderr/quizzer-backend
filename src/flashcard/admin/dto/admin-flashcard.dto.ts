import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { GenerateFlashcardDto } from '../../dto/flashcard.dto';
import { ContentScope } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdminFlashcardDto extends GenerateFlashcardDto {
  @ApiProperty({
    enum: ContentScope,
    description: 'Scope of the content (GLOBAL or SCHOOL)',
  })
  @IsEnum(ContentScope)
  scope: ContentScope;

  @ApiPropertyOptional({ description: 'School ID if scope is SCHOOL' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Whether the flashcard set is active',
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

export class UpdateAdminFlashcardDto {
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
