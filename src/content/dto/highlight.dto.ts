import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateHighlightDto {
  @ApiProperty({
    example: 'This is an important concept',
    description: 'Highlighted text',
  })
  @IsString()
  @MaxLength(5000, { message: 'Highlight text cannot exceed 5000 characters' })
  text: string;

  @ApiProperty({
    example: 'yellow',
    description: 'Color of the highlight',
    enum: ['yellow', 'green', 'pink'],
  })
  @IsOptional()
  @IsEnum(['yellow', 'green', 'pink'], {
    message: 'Color must be yellow, green, or pink',
  })
  color?: string;

  @ApiProperty({ example: 0, description: 'Start offset of the highlight' })
  @IsInt()
  startOffset: number;

  @ApiProperty({ example: 28, description: 'End offset of the highlight' })
  @IsInt()
  endOffset: number;

  @ApiProperty({
    example: 'Remember to review this later',
    description: 'Note for the highlight',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Note cannot exceed 1000 characters' })
  note?: string;

  @ApiProperty({
    example: 0,
    description: 'Index of the section where the highlight is located',
    required: false,
  })
  @IsOptional()
  @IsInt()
  sectionIndex?: number;
}

export class CreateHighlightsBatchDto {
  @ApiProperty({
    description: 'Array of highlights to create',
    type: [CreateHighlightDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateHighlightDto)
  highlights: CreateHighlightDto[];
}

export class DeleteHighlightsBatchDto {
  @ApiProperty({
    description: 'Array of highlight IDs to delete',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  highlightIds: string[];
}

export class GetHighlightsFilterDto {
  @ApiProperty({
    required: false,
    description: 'Filter by color',
    enum: ['yellow', 'green', 'pink'],
  })
  @IsOptional()
  @IsEnum(['yellow', 'green', 'pink'])
  color?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by section index',
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sectionIndex?: number;

  @ApiProperty({
    required: false,
    description: 'Filter highlights that have notes',
  })
  @IsOptional()
  hasNote?: boolean;
}
