import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { UserDocumentService } from './user-document.service';
import {
  UserDocumentDto,
  CreateUserDocumentDto,
} from './dto/user-document.dto';

@ApiTags('User Documents')
@ApiBearerAuth()
@Controller('user-documents')
@UseGuards(JwtAuthGuard)
export class UserDocumentController {
  constructor(private readonly userDocumentService: UserDocumentService) {}

  @Get()
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  async getUserDocuments(
    @CurrentUser() user: User,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20
  ) {
    return this.userDocumentService.getUserDocuments(
      user.id,
      Number(page),
      Number(limit)
    );
  }

  @Get(':id')
  async getUserDocumentById(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<UserDocumentDto> {
    return this.userDocumentService.getUserDocumentById(user.id, id);
  }

  @Post()
  async createUserDocument(
    @CurrentUser() user: User,
    @Body() dto: CreateUserDocumentDto
  ): Promise<UserDocumentDto> {
    return this.userDocumentService.createUserDocument(
      user.id,
      dto.documentId,
      dto.displayName
    );
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      fileFilter: (_req, file, cb) => {
        // Accept only PDFs
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'), false);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB per file
      },
    })
  )
  async uploadFiles(
    @CurrentUser() user: User,
    @UploadedFiles() files: Express.Multer.File[]
  ): Promise<UserDocumentDto[]> {
    return this.userDocumentService.uploadFiles(user.id, files);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUserDocument(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<void> {
    return this.userDocumentService.deleteUserDocument(user.id, id);
  }

  @Get(':id/download')
  async getDownloadUrl(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<{ url: string }> {
    const userDocument = await this.userDocumentService.getUserDocumentById(
      user.id,
      id
    );
    return { url: userDocument.document.cloudinaryUrl };
  }
}
