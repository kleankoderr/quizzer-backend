import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, description: 'User name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, description: 'Avatar URL' })
  @IsOptional()
  @IsUrl()
  avatar?: string;

  @ApiProperty({ required: false, description: 'School name' })
  @IsOptional()
  @IsString()
  schoolName?: string;

  @ApiProperty({ required: false, description: 'Grade level' })
  @IsOptional()
  @IsString()
  grade?: string;
}
