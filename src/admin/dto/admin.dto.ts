import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsDateString,
  IsObject,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by premium subscription status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPremium?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}

export class ContentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string; // quiz, flashcard, etc.

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}

export class CreateSchoolDto {
  @ApiProperty()
  @IsString()
  name: string;
}

export class UpdateSchoolDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}

export class PlatformSettingsDto {
  @ApiProperty()
  @IsBoolean()
  allowRegistration: boolean;

  @ApiProperty()
  @IsBoolean()
  maintenanceMode: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supportEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  aiProviderConfig?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enableWelcomeEmailCampaign?: boolean;
}

export class ModerationActionDto {
  @ApiProperty({ enum: ['DELETE', 'HIDE', 'IGNORE'] })
  @IsEnum(['DELETE', 'HIDE', 'IGNORE'])
  action: 'DELETE' | 'HIDE' | 'IGNORE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateChallengeDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ enum: ['daily', 'weekly', 'monthly', 'hot'] })
  @IsEnum(['daily', 'weekly', 'monthly', 'hot'])
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty()
  @IsNumber()
  target: number;

  @ApiProperty()
  @IsNumber()
  reward: number;

  @ApiProperty()
  @IsDateString()
  startDate: Date;

  @ApiProperty()
  @IsDateString()
  endDate: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  timeLimit?: number;

  @ApiProperty({
    enum: ['STANDARD', 'TIMED', 'SCENARIO', 'SPEED', 'ACCURACY', 'MIXED'],
    default: 'STANDARD',
  })
  @IsEnum(['STANDARD', 'TIMED', 'SCENARIO', 'SPEED', 'ACCURACY', 'MIXED'])
  format: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  quizIds?: string[];
}

// Subscription Management DTOs

export class SubscriptionFilterDto {
  @ApiPropertyOptional({ description: 'Filter by subscription status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by plan ID' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Filter by start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}

export class CreateSubscriptionPlanDto {
  @ApiProperty({ description: 'Plan name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Price in Naira (e.g., 2000)' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Billing interval',
    enum: ['month', 'year'],
    default: 'month',
  })
  @IsEnum(['month', 'year'])
  interval: string;

  @ApiProperty({
    description: 'Plan quotas (quizzes, flashcards, learningGuides, etc.)',
    example: {
      quizzes: 15,
      flashcards: 15,
      learningGuides: 10,
      explanations: 20,
      storageLimitMB: 1000,
      filesPerMonth: 100,
    },
  })
  @IsObject()
  quotas: Record<string, any>;

  @ApiPropertyOptional({ description: 'Whether plan is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubscriptionPlanDto {
  @ApiPropertyOptional({ description: 'Plan name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Price in Naira' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: 'Billing interval',
    enum: ['month', 'year'],
  })
  @IsOptional()
  @IsEnum(['month', 'year'])
  interval?: string;

  @ApiPropertyOptional({ description: 'Plan quotas' })
  @IsOptional()
  @IsObject()
  quotas?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Whether plan is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
