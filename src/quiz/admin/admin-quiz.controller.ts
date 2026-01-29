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
import { AdminQuizService } from './admin-quiz.service';
import { CreateAdminQuizDto, UpdateAdminQuizDto } from './dto/admin-quiz.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ContentScope } from '@prisma/client';
import { AdminGuard } from '../../admin/guards/admin.guard';

@ApiTags('Admin Quizzes')
@ApiBearerAuth()
@Controller('admin/quiz')
@UseGuards(JwtAuthGuard)
export class AdminQuizController {
  constructor(private readonly adminQuizService: AdminQuizService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a new admin quiz' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Quiz creation job started' })
  @UseInterceptors(FilesInterceptor('files', 5))
  async createAdminQuiz(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAdminQuizDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    return this.adminQuizService.createAdminQuiz(userId, dto, files);
  }

  @Get()
  @ApiOperation({ summary: 'List all admin quizzes' })
  @ApiResponse({ status: 200, description: 'Return all admin quizzes.' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ContentScope })
  @ApiQuery({ name: 'schoolId', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: ContentScope,
    @Query('schoolId') schoolId?: string
  ) {
    return this.adminQuizService.findAllAdminQuizzes(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      scope,
      schoolId
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get admin quiz details' })
  @ApiResponse({ status: 200, description: 'Return the admin quiz.' })
  @ApiResponse({ status: 404, description: 'Admin quiz not found.' })
  async findOne(@Param('id') id: string) {
    return this.adminQuizService.getAdminQuizById(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update admin quiz' })
  async update(@Param('id') id: string, @Body() dto: UpdateAdminQuizDto) {
    return this.adminQuizService.updateAdminQuiz(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete admin quiz' })
  async remove(@Param('id') id: string) {
    return this.adminQuizService.deleteAdminQuiz(id);
  }
}
