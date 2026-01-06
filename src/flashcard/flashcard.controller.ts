import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FlashcardService } from './flashcard.service';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GenerateFlashcardDto } from './dto/flashcard.dto';
import { EntitlementKeys } from '../subscription/constants/entitlement-keys';
import { RequireEntitlement } from '../subscription/decorators/require-entitlement.decorator';

@ApiTags('Flashcards')
@ApiBearerAuth()
@Controller('flashcards')
export class FlashcardController {
  constructor(private readonly flashcardService: FlashcardService) {}

  @RequireEntitlement({ key: EntitlementKeys.FLASHCARD, consume: true })
  @Post('generate')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'Generate flashcards' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Flashcards successfully generated',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      fileFilter: (_req, file, cb) => {
        // Accept only PDFs
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'), false);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // optional: 5 MB per file
      },
    })
  )
  async generateFlashcards(
    @CurrentUser('sub') userId: string,
    @Body() dto: GenerateFlashcardDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    return this.flashcardService.generateFlashcards(userId, dto, files);
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Check flashcard generation job status' })
  @ApiResponse({ status: 200, description: 'Job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(
    @Param('jobId') jobId: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.flashcardService.getJobStatus(jobId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all flashcard sets for current user' })
  @ApiResponse({ status: 200, description: 'List of flashcard sets' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  async getAllFlashcardSets(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.flashcardService.getAllFlashcardSets(
      userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get flashcard set by ID' })
  @ApiResponse({ status: 200, description: 'Flashcard set details' })
  @ApiResponse({ status: 404, description: 'Flashcard set not found' })
  async getFlashcardSetById(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.flashcardService.getFlashcardSetById(id, userId);
  }

  @Post(':id/record-session')
  @ApiOperation({ summary: 'Record flashcard study session with responses' })
  @ApiResponse({ status: 201, description: 'Session recorded successfully' })
  @ApiResponse({ status: 404, description: 'Flashcard set not found' })
  async recordFlashcardSession(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: any
  ) {
    return this.flashcardService.recordFlashcardSession(
      userId,
      id,
      dto.cardResponses
    );
  }

  @Get(':id/attempts')
  @ApiOperation({ summary: 'Get all attempts for a flashcard set' })
  @ApiResponse({ status: 200, description: 'List of flashcard attempts' })
  @ApiResponse({ status: 404, description: 'Flashcard set not found' })
  async getFlashcardAttempts(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.flashcardService.getFlashcardAttempts(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete flashcard set' })
  @ApiResponse({
    status: 200,
    description: 'Flashcard set deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Flashcard set not found' })
  async deleteFlashcardSet(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.flashcardService.deleteFlashcardSet(id, userId);
  }
}
