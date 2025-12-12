import { IsString, IsOptional } from 'class-validator';

export class CreateStudyPackDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;
}

export class UpdateStudyPackDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;
}

export class MoveItemDto {
  @IsString()
  type: 'quiz' | 'flashcard' | 'content' | 'file';

  @IsString()
  itemId: string;
}
