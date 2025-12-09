import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StudyService } from './study.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Study')
@Controller('study')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Get('insights')
  @ApiOperation({ summary: 'Get study insights and suggestions' })
  @ApiResponse({ status: 200, description: 'Study insights' })
  async getInsights(@CurrentUser('sub') userId: string) {
    return this.studyService.getStudyInsights(userId);
  }
}
