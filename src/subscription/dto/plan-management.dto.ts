import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
} from 'class-validator';

export class CreateEntitlementDto {
  @ApiProperty({ example: 'quiz' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Monthly Quizzes' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'Number of quizzes a user can generate per month',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'COUNTER', enum: ['COUNTER', 'BOOLEAN'] })
  @IsString()
  type: string;
}

export class PlanEntitlementDto {
  @ApiProperty()
  @IsString()
  entitlementId: string;

  @ApiProperty({ example: 10 })
  value: any;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'Monthly Pro' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Advanced features for power users' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 9.99 })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 'monthly' })
  @IsString()
  interval: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [PlanEntitlementDto] })
  @IsOptional()
  @IsArray()
  entitlements?: PlanEntitlementDto[];
}

export class UpdatePlanDto extends CreatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interval: string;
}
