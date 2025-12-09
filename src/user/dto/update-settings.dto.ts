import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({
    required: false,
    description: 'User preferences as JSON object',
    example: { theme: 'dark', notifications: true },
  })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, any>;
}
