import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { UserRole } from "@prisma/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
  @IsBoolean()
  isActive?: boolean;

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
}

export class ModerationActionDto {
  @ApiProperty({ enum: ["DELETE", "HIDE", "IGNORE"] })
  @IsEnum(["DELETE", "HIDE", "IGNORE"])
  action: "DELETE" | "HIDE" | "IGNORE";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
