import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminStudyPackService } from './admin-study-pack.service';
import { CreateAdminStudyPackDto, UpdateAdminStudyPackDto } from './dto/admin-study-pack.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ContentScope } from '@prisma/client';

@ApiTags('Admin Study Packs')
@ApiBearerAuth()
@Controller('admin/study-pack')
@UseGuards(JwtAuthGuard)
export class AdminStudyPackController {
  constructor(private readonly adminStudyPackService: AdminStudyPackService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create admin study pack' })
  @ApiResponse({ status: 201, description: 'Admin study pack created' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAdminStudyPackDto
  ) {
    return this.adminStudyPackService.create(userId, dto);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all admin study packs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ContentScope })
  @ApiQuery({ name: 'schoolId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'Paginated list of admin study packs' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: ContentScope,
    @Query('schoolId') schoolId?: string,
    @Query('search') search?: string
  ) {
    return this.adminStudyPackService.findAll(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      scope,
      schoolId,
      search
    );
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get admin study pack by id' })
  @ApiResponse({ status: 200, description: 'Admin study pack details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string) {
    return this.adminStudyPackService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update admin study pack' })
  @ApiResponse({ status: 200, description: 'Updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateAdminStudyPackDto) {
    return this.adminStudyPackService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete admin study pack' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  async remove(@Param('id') id: string) {
    return this.adminStudyPackService.remove(id);
  }
}
