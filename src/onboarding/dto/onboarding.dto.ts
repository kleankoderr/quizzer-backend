import {
  IsString,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FinishOnboardingDto {
  @ApiProperty({
    example: 'Undergraduate',
    description: 'Current level of education',
  })
  @IsString()
  @IsOptional()
  grade?: string;

  @ApiProperty({
    example: 'University of Lagos',
    description: 'Name of the school',
  })
  @IsString()
  @IsOptional()
  @MinLength(3, { message: 'School name must be at least 3 characters' })
  @MaxLength(100, { message: 'School name cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z0-9\s.,&'()-]+$/, {
    message: 'School name contains invalid characters',
  })
  schoolName?: string;

  @ApiProperty({
    example: ['Mathematics', 'Physics'],
    description: 'List of subjects',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  subjects?: string[];

  @ApiProperty({ example: 'student', description: 'User type' })
  @IsString()
  @IsOptional()
  userType?: string;
}
