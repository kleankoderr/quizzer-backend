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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ContentService } from './content.service';
import {
  CreateContentDto,
  CreateHighlightDto,
  UpdateContentDto,
} from './dto/content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PdfOnly } from '../common/decorators/pdf-only.decorator';

@ApiTags('Content')
@Controller('content')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate content from topic' })
  @ApiResponse({ status: 201, description: 'Content generation job started' })
  async generateFromTopic(
    @CurrentUser('sub') userId: string,
    @Body() body: { topic: string }
  ) {
    return this.contentService.generate(userId, { topic: body.topic });
  }

  @Post('upload')
  @UseInterceptors(
    PdfOnly({ maxFiles: 5, maxSizePerFile: 5 * 1024 * 1024 }),
    FilesInterceptor('files', 5)
  )
  @ApiOperation({ summary: 'Upload and process files to create content' })
  @ApiResponse({
    status: 201,
    description: 'File upload job started',
  })
  async uploadFile(
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    const fileArray = Array.isArray(files) ? files : [files];
    return this.contentService.generate(userId, {}, fileArray);
  }

  @Post()
  @ApiOperation({ summary: 'Create new content' })
  @ApiResponse({ status: 201, description: 'Content created successfully' })
  async createContent(
    @CurrentUser('sub') userId: string,
    @Body() createContentDto: CreateContentDto
  ) {
    return this.contentService.createContent(userId, createContentDto);
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
    @Query('limit') limit: number = 10
  ) {
    return this.contentService.getContents(
      userId,
      topic,
      Number(page),
      Number(limit)
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

  @Post(':id/highlights')
  @ApiOperation({ summary: 'Add highlight to content' })
  @ApiResponse({ status: 201, description: 'Highlight added successfully' })
  async addHighlight(
    @CurrentUser('sub') userId: string,
    @Param('id') contentId: string,
    @Body() createHighlightDto: CreateHighlightDto
  ) {
    return this.contentService.addHighlight(
      userId,
      contentId,
      createHighlightDto
    );
  }

  @Delete('highlights/:id')
  @ApiOperation({ summary: 'Delete highlight' })
  @ApiResponse({ status: 200, description: 'Highlight deleted successfully' })
  async deleteHighlight(
    @CurrentUser('sub') userId: string,
    @Param('id') highlightId: string
  ) {
    return this.contentService.deleteHighlight(userId, highlightId);
  }

  @Post(':id/explain')
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

  @Post(':id/example')
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
