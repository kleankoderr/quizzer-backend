import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateContentDto {
  @ApiProperty({
    example: 'Introduction to Biology',
    description: 'Title of the content',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Biology is the study of life...',
    description: 'The actual text content',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: 'Biology', description: 'Topic of the content' })
  @IsString()
  @IsNotEmpty()
  topic: string;
}

export class CreateHighlightDto {
  @ApiProperty({
    example: 'Biology is the study of life',
    description: 'Highlighted text',
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({
    example: 'yellow',
    description: 'Color of the highlight',
    required: false,
  })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiProperty({ example: 0, description: 'Start offset of the highlight' })
  @IsInt()
  startOffset: number;

  @ApiProperty({ example: 28, description: 'End offset of the highlight' })
  @IsInt()
  endOffset: number;

  @ApiProperty({
    example: 'Important definition',
    description: 'Note for the highlight',
    required: false,
  })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty({
    example: 0,
    description: 'Index of the section where the highlight is located',
    required: false,
  })
  @IsInt()
  @IsOptional()
  sectionIndex?: number;
}

export class UpdateContentDto {
  @ApiProperty({
    example: 'Introduction to Biology',
    description: 'Title of the content',
    required: false,
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    example: 'Biology is the study of life...',
    description: 'The actual text content',
    required: false,
  })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({
    example: 'Biology',
    description: 'Topic of the content',
    required: false,
  })
  @IsString()
  @IsOptional()
  topic?: string;

  @ApiProperty({
    description: 'Structured learning guide',
    required: false,
  })
  @IsOptional()
  learningGuide?: any;

  @ApiProperty({
    description: 'Last read position in percentage (0-100)',
    required: false,
  })
  @IsOptional()
  lastReadPosition?: number;
}
