import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ContentService } from './content.service';
import { CreateContentDto, UpdateContentDto } from './dto/content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuotaGuard } from '../common/guards/quota.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CheckQuota } from '../common/decorators/check-quota.decorator';

@ApiTags('Content')
@Controller('content')
@UseGuards(JwtAuthGuard, QuotaGuard)
@ApiBearerAuth()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @CheckQuota('studyMaterial')
  @Post('generate')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Generate a new content' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Content successfully generated' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiBody({
    description: 'Upload up to 5 PDF files',
    required: false,
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      fileFilter: (req, file, cb) => {
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
  async generateContent(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateContentDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    if (
      !dto.topic &&
      !dto.content &&
      (!files || files.length === 0) &&
      (!dto.selectedFileIds || dto.selectedFileIds.length === 0)
    ) {
      throw new BadRequestException(
        'Please provide either a topic, content, or upload files'
      );
    }

    return this.contentService.generate(userId, dto, files);
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Check content generation job status' })
  @ApiResponse({ status: 200, description: 'Job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(
    @Param('jobId') jobId: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.contentService.getJobStatus(jobId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all content for user' })
  @ApiQuery({ name: 'topic', required: false, description: 'Filter by topic' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'List of contents' })
  async getContents(
    @CurrentUser('sub') userId: string,
    @Query('topic') topic?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('studyPackId') studyPackId?: string
  ) {
    return this.contentService.getContents(
      userId,
      topic,
      Number(page),
      Number(limit),
      studyPackId
    );
  }

  @Get('popular-topics')
  @ApiOperation({ summary: 'Get popular topics' })
  @ApiResponse({ status: 200, description: 'List of popular topics' })
  async getPopularTopics() {
    return this.contentService.getPopularTopics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get content by ID' })
  @ApiResponse({ status: 200, description: 'Content details' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async getContentById(
    @CurrentUser('sub') userId: string,
    @Param('id') contentId: string
  ) {
    return this.contentService.getContentById(userId, contentId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update content' })
  @ApiResponse({ status: 200, description: 'Content updated successfully' })
  async updateContent(
    @CurrentUser('sub') userId: string,
    @Param('id') contentId: string,
    @Body() updateContentDto: UpdateContentDto
  ) {
    return this.contentService.updateContent(
      userId,
      contentId,
      updateContentDto
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete content' })
  @ApiResponse({ status: 200, description: 'Content deleted successfully' })
  async deleteContent(
    @CurrentUser('sub') userId: string,
    @Param('id') contentId: string
  ) {
    return this.contentService.deleteContent(userId, contentId);
  }

  @CheckQuota('conceptExplanation')
  @Post(':id/explain')
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @ApiOperation({ summary: 'Generate explanation for a section' })
  @ApiResponse({
    status: 200,
    description: 'Explanation generated successfully',
  })
  async explainSection(
    @CurrentUser('sub') userId: string,
    @Param('id') contentId: string,
    @Body() body: { sectionTitle: string; sectionContent: string }
  ) {
    return this.contentService.generateExplanation(
      userId,
      contentId,
      body.sectionTitle,
      body.sectionContent
    );
  }

  @CheckQuota('conceptExplanation')
  @Post(':id/example')
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @ApiOperation({ summary: 'Generate examples for a section' })
  @ApiResponse({ status: 200, description: 'Examples generated successfully' })
  async exampleSection(
    @CurrentUser('sub') userId: string,
    @Param('id') contentId: string,
    @Body() body: { sectionTitle: string; sectionContent: string }
  ) {
    return this.contentService.generateExample(
      userId,
      contentId,
      body.sectionTitle,
      body.sectionContent
    );
  }
}
