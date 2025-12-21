import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SummaryService } from './summary.service';
import { ToggleVisibilityDto, AddReactionDto } from './dto/summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PremiumGuard } from '../common/guards/premium.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  /**
   * Get all summaries for the current user
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getUserSummaries(@CurrentUser('sub') userId: string) {
    return this.summaryService.listUserSummaries(userId);
  }

  /**
   * Queue summary generation for a study material
   * Requires: JWT auth + Premium plan
   * Returns: Job ID for tracking
   */
  @Post(':id/generate')
  @UseGuards(JwtAuthGuard, PremiumGuard)
  @HttpCode(HttpStatus.CREATED)
  async queueSummaryGeneration(
    @CurrentUser('sub') userId: string,
    @Param('id') studyMaterialId: string
  ) {
    return this.summaryService.queueSummaryGeneration(studyMaterialId, userId);
  }

  /**
   * Toggle summary visibility (public/private)
   * Requires: JWT auth
   * Ownership verified in service layer
   */
  @Patch(':id/visibility')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async toggleVisibility(
    @CurrentUser('sub') userId: string,
    @Param('id') summaryId: string,
    @Body() dto: ToggleVisibilityDto
  ) {
    await this.summaryService.toggleVisibility(summaryId, userId, dto.isPublic);
    return {
      message: `Summary visibility updated to ${dto.isPublic ? 'public' : 'private'}`,
    };
  }

  /**
   * Delete a summary
   * Requires: JWT auth
   * Ownership verified in service layer
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteSummary(
    @CurrentUser('sub') userId: string,
    @Param('id') summaryId: string
  ) {
    await this.summaryService.deleteSummary(summaryId, userId);
    return { message: 'Summary deleted successfully' };
  }

  /**
   * Add or remove a reaction (toggle behavior)
   * Requires: JWT auth
   */
  @Post(':shortCode/react')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async addReaction(
    @CurrentUser('sub') userId: string,
    @Param('shortCode') shortCode: string,
    @Body() dto: AddReactionDto
  ) {
    const result = await this.summaryService.addReaction(
      shortCode,
      userId,
      dto.type
    );
    return {
      message: `Reaction ${result.action}`,
      action: result.action,
    };
  }

  // ====================================
  // PUBLIC ENDPOINTS (RATE LIMITED)
  // ====================================

  /**
   * Get summary by short code
   * Public endpoint with rate limiting
   * Rate limit: 60 requests per minute per IP
   */
  @Get(':shortCode')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute
  @HttpCode(HttpStatus.OK)
  async getSummary(
    @Param('shortCode') shortCode: string,
    @CurrentUser('sub') userId?: string
  ) {
    return this.summaryService.findByShortCode(shortCode, userId);
  }

  /**
   * Track view count for a summary
   * Public endpoint with rate limiting
   * Rate limit: 10 requests per minute per IP
   */
  @Post(':shortCode/view')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  async trackView(@Param('shortCode') shortCode: string) {
    await this.summaryService.incrementViewCount(shortCode);
    return { message: 'View tracked successfully' };
  }
}
