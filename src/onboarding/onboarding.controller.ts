import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '@prisma/client';

@ApiTags('Onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('finish')
  @ApiOperation({ summary: 'Save preferences and complete onboarding' })
  @ApiResponse({ status: 200, description: 'Onboarding completed' })
  async finishOnboarding(
    @CurrentUser() user: User,
    @Body()
    body: {
      grade?: string;
      schoolName?: string;
      subjects?: string[];
      userType?: string;
    }
  ) {
    // Prevent admin users from accessing onboarding
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admin users do not require onboarding');
    }

    // Save preferences and trigger assessment
    await this.onboardingService.savePreferences(user.id, body);

    // Mark onboarding as complete
    await this.onboardingService.completeOnboarding(user.id);

    return { message: 'Onboarding completed successfully' };
  }

  @Get('status')
  @ApiOperation({ summary: 'Check assessment generation status' })
  @ApiResponse({ status: 200, description: 'Status retrieved' })
  async checkStatus(@CurrentUser() user: User) {
    // Prevent admin users from accessing onboarding
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admin users do not require onboarding');
    }

    return this.onboardingService.checkAssessmentStatus(user.id);
  }
}
