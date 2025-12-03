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
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from "@nestjs/swagger";
import { FlashcardService } from "./flashcard.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { GenerateFlashcardDto } from "./dto/flashcard.dto";
import { PdfOnly } from "../common/decorators/pdf-only.decorator";

@ApiTags("Flashcards")
@ApiBearerAuth()
@Controller("flashcards")
@UseGuards(JwtAuthGuard)
export class FlashcardController {
  constructor(private readonly flashcardService: FlashcardService) {}

  @Post("generate")
  @ApiOperation({ summary: "Generate flashcards" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({
    status: 201,
    description: "Flashcards successfully generated",
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @UseInterceptors(
    PdfOnly({ maxFiles: 5, maxSizePerFile: 5 * 1024 * 1024 }),
    FilesInterceptor("files", 5)
  )
  async generateFlashcards(
    @CurrentUser("sub") userId: string,
    @Body() dto: GenerateFlashcardDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    if (!dto.topic && !dto.content && (!files || files.length === 0)) {
      throw new BadRequestException(
        "Please provide either a topic, content, or upload files to generate flashcards"
      );
    }

    if (!dto.numberOfCards) {
      throw new BadRequestException("numberOfCards is required");
    }

    const numberOfCards = Number(dto.numberOfCards);
    if (isNaN(numberOfCards) || numberOfCards < 5 || numberOfCards > 100) {
      throw new BadRequestException(
        "numberOfCards must be a number between 5 and 100"
      );
    }

    dto.numberOfCards = numberOfCards;

    return this.flashcardService.generateFlashcards(userId, dto, files);
  }

  @Get("status/:jobId")
  @ApiOperation({ summary: "Check flashcard generation job status" })
  @ApiResponse({ status: 200, description: "Job status" })
  @ApiResponse({ status: 404, description: "Job not found" })
  async getJobStatus(
    @Param("jobId") jobId: string,
    @CurrentUser("sub") userId: string
  ) {
    return this.flashcardService.getJobStatus(jobId, userId);
  }

  @Get()
  @ApiOperation({ summary: "Get all flashcard sets for current user" })
  @ApiResponse({ status: 200, description: "List of flashcard sets" })
  async getAllFlashcardSets(@CurrentUser("sub") userId: string) {
    return this.flashcardService.getAllFlashcardSets(userId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get flashcard set by ID" })
  @ApiResponse({ status: 200, description: "Flashcard set details" })
  @ApiResponse({ status: 404, description: "Flashcard set not found" })
  async getFlashcardSetById(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string
  ) {
    return this.flashcardService.getFlashcardSetById(id, userId);
  }

  @Post(":id/record-session")
  @ApiOperation({ summary: "Record flashcard study session with responses" })
  @ApiResponse({ status: 201, description: "Session recorded successfully" })
  @ApiResponse({ status: 404, description: "Flashcard set not found" })
  async recordFlashcardSession(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: any
  ) {
    return this.flashcardService.recordFlashcardSession(
      userId,
      id,
      dto.cardResponses
    );
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete flashcard set" })
  @ApiResponse({
    status: 200,
    description: "Flashcard set deleted successfully",
  })
  @ApiResponse({ status: 404, description: "Flashcard set not found" })
  async deleteFlashcardSet(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string
  ) {
    return this.flashcardService.deleteFlashcardSet(id, userId);
  }
}
