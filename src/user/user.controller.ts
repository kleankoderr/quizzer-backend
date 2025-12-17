import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { QuotaService } from '../common/services/quota.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('User')
@Controller('user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly quotaService: QuotaService
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile with statistics' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.userService.getProfile(userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() updateProfileDto: UpdateProfileDto
  ) {
    return this.userService.updateProfile(userId, updateProfileDto);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update user settings and preferences' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateSettings(
    @CurrentUser('sub') userId: string,
    @Body() updateSettingsDto: UpdateSettingsDto
  ) {
    return this.userService.updateSettings(userId, updateSettingsDto);
  }

  @Put('password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    return this.userService.changePassword(userId, changePasswordDto);
  }

  @Post('profile/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({ summary: 'Upload profile avatar' })
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async uploadAvatar(
    @CurrentUser('sub') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    return this.userService.uploadAvatar(userId, file);
  }

  @Delete('account')
  @ApiOperation({ summary: 'Delete user account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteAccount(@CurrentUser('sub') userId: string) {
    return this.userService.deleteAccount(userId);
  }

  @Post('assessment-popup-shown')
  @ApiOperation({ summary: 'Mark assessment popup as shown' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  async updateAssessmentPopupShown(@CurrentUser('sub') userId: string) {
    return this.userService.updateAssessmentPopupShown(userId);
  }

  @Get('quota')
  @ApiOperation({ summary: 'Get current quota status' })
  @ApiResponse({
    status: 200,
    description: 'Quota status retrieved successfully',
  })
  async getQuotaStatus(@CurrentUser('sub') userId: string) {
    return this.quotaService.getQuotaStatus(userId);
  }
}
