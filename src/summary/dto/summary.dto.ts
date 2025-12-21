import { IsBoolean, IsEnum, IsNotEmpty } from 'class-validator';

export class ToggleVisibilityDto {
  @IsBoolean()
  @IsNotEmpty()
  isPublic: boolean;
}

export enum ReactionType {
  LIKE = 'like',
  LOVE = 'love',
  HELPFUL = 'helpful',
  BOOKMARK = 'bookmark',
}

export class AddReactionDto {
  @IsEnum(ReactionType)
  @IsNotEmpty()
  type: ReactionType;
}
