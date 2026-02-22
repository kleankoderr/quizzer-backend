import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminFlashcardService } from './admin-flashcard.service';
import { CreateAdminFlashcardDto, UpdateAdminFlashcardDto } from './dto/admin-flashcard.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ContentScope } from '@prisma/client';

@ApiTags('Admin Flashcards')
@ApiBearerAuth()
@Controller('admin/flashcard')
@UseGuards(JwtAuthGuard)
export class AdminFlashcardController {
  constructor(private readonly adminFlashcardService: AdminFlashcardService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create admin flashcard set (queues generation)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateAdminFlashcardDto })
  @ApiResponse({ status: 201, description: 'Generation job started, returns jobId' })
  @UseInterceptors(FilesInterceptor('files', 5))
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAdminFlashcardDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    return this.adminFlashcardService.createAdminFlashcardSet(userId, dto, files);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all admin flashcard sets' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ContentScope })
  @ApiQuery({ name: 'schoolId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'Paginated list of admin flashcard sets' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: ContentScope,
    @Query('schoolId') schoolId?: string,
    @Query('search') search?: string
  ) {
    return this.adminFlashcardService.findAllAdminFlashcardSets(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      scope,
      schoolId,
      search
    );
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get admin flashcard set by id' })
  @ApiResponse({ status: 200, description: 'Admin flashcard set details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string) {
    return this.adminFlashcardService.getAdminFlashcardSetById(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Edit admin flashcard set (scope, isActive)' })
  @ApiResponse({ status: 200, description: 'Updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateAdminFlashcardDto) {
    return this.adminFlashcardService.updateAdminFlashcardSet(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete admin flashcard set' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  async remove(@Param('id') id: string) {
    return this.adminFlashcardService.deleteAdminFlashcardSet(id);
  }
}
