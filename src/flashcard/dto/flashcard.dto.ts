import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsIn,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export class GenerateFlashcardDto {
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
  @Min(5)
  @Max(100)
  numberOfCards: number;
}

export class CardResponseDto {
  @IsInt()
  cardIndex: number;

  @IsString()
  @IsIn(["know", "dont-know", "skipped"])
  response: "know" | "dont-know" | "skipped";
}

export class RecordFlashcardSessionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardResponseDto)
  cardResponses: CardResponseDto[];
}
