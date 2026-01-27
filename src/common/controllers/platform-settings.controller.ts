import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformSettingsService } from '../services/platform-settings.service';
import { PlatformSettingsDto } from '../dto/platform-settings.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';

@ApiTags('Platform Settings')
@Controller('platform-settings')
export class PlatformSettingsController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @Get('public')
  @ApiOperation({ summary: 'Get public settings (no auth required)' })
  async getPublicSettings() {
    return this.platformSettings.getPublicSettings();
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get all platform settings (admin only)' })
  getSettings() {
    return this.platformSettings.getSettings();
  }

  @Patch()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Update platform settings (admin only)' })
  updateSettings(
    @Body()
    data: PlatformSettingsDto
  ) {
    return this.platformSettings.updateSettings(data);
  }
}
