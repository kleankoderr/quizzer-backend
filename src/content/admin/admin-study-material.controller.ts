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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminStudyMaterialService } from './admin-study-material.service';
import { ContentService } from '../content.service';
import { GenerateAdminStudyMaterialDto, UpdateAdminStudyMaterialDto } from '../dto/admin-study-material.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ContentScope } from '@prisma/client';

@ApiTags('Admin Study Materials')
@ApiBearerAuth()
@Controller('admin/study-material')
@UseGuards(JwtAuthGuard)
export class AdminStudyMaterialController {
  constructor(
    private readonly adminStudyMaterialService: AdminStudyMaterialService,
    private readonly contentService: ContentService
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Generate admin study material (queues job, visible to everyone when done)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Generation job started, returns jobId' })
  @UseInterceptors(FilesInterceptor('files', 5))
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: GenerateAdminStudyMaterialDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    const { scope, schoolId, isActive, ...contentDto } = dto;
    return this.contentService.generateAdmin(
      userId,
      contentDto,
      files,
      {
        scope: scope as ContentScope,
        schoolId,
        isActive: isActive ?? true,
      }
    );
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all admin study materials' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ContentScope })
  @ApiQuery({ name: 'schoolId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'Paginated list of admin study materials' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: ContentScope,
    @Query('schoolId') schoolId?: string,
    @Query('search') search?: string
  ) {
    return this.adminStudyMaterialService.findAll(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      scope,
      schoolId,
      search
    );
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get admin study material by id' })
  @ApiResponse({ status: 200, description: 'Study material details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string) {
    return this.adminStudyMaterialService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update admin study material' })
  @ApiResponse({ status: 200, description: 'Updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminStudyMaterialDto
  ) {
    return this.adminStudyMaterialService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete admin study material' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  async remove(@Param('id') id: string) {
    return this.adminStudyMaterialService.remove(id);
  }
}
