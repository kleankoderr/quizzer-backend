import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GenerateQuizDto, SubmitQuizDto } from './dto/quiz.dto';

@ApiTags('Quizzes')
@ApiBearerAuth()
@Controller('quiz')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a new quiz' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Quiz successfully generated' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
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
  async generateQuiz(
    @CurrentUser('sub') userId: string,
    @Body() dto: GenerateQuizDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    if (!dto.topic && !dto.content && (!files || files.length === 0)) {
      throw new BadRequestException(
        'Please provide either a topic, content, or upload files'
      );
    }

    return this.quizService.generateQuiz(userId, dto, files);
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Check quiz generation job status' })
  @ApiResponse({ status: 200, description: 'Job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(
    @Param('jobId') jobId: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.quizService.getJobStatus(jobId, userId);
  }

  @Get('attempt/:id')
  @ApiOperation({ summary: 'Get a specific attempt by ID' })
  @ApiResponse({ status: 200, description: 'Attempt details' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  async getAttempt(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.quizService.getAttemptById(id, userId);
  }

  @Get('attempt/:id/review')
  @ApiOperation({ summary: 'Get detailed review of a specific attempt' })
  @ApiResponse({ status: 200, description: 'Attempt review details' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  async getAttemptReview(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.quizService.getAttemptReview(id, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all quizzes for current user' })
  @ApiResponse({ status: 200, description: 'List of user quizzes' })
  async getAllQuizzes(@CurrentUser('sub') userId: string) {
    return this.quizService.getAllQuizzes(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get quiz by ID' })
  @ApiResponse({ status: 200, description: 'Quiz details' })
  @ApiResponse({ status: 404, description: 'Quiz not found' })
  async getQuizById(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.quizService.getQuizById(id, userId);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit quiz answers and get results' })
  @ApiResponse({ status: 200, description: 'Quiz results' })
  @ApiResponse({ status: 400, description: 'Invalid submission' })
  async submitQuiz(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SubmitQuizDto
  ) {
    return this.quizService.submitQuiz(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete quiz' })
  @ApiResponse({ status: 200, description: 'Quiz deleted successfully' })
  @ApiResponse({ status: 404, description: 'Quiz not found' })
  async deleteQuiz(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string
  ) {
    return this.quizService.deleteQuiz(id, userId);
  }
}
