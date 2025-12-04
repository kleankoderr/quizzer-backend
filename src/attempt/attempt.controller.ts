import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AttemptService } from "./attempt.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("attempts")
@UseGuards(JwtAuthGuard)
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Get()
  async getAllAttempts(@CurrentUser("sub") userId: string) {
    return this.attemptService.getAllAttempts(userId);
  }

  @Get("quiz/:quizId")
  async getAttemptsByQuiz(
    @Param("quizId") quizId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.attemptService.getAttemptsByQuiz(quizId, userId);
  }

  @Get("flashcard/:flashcardId")
  async getAttemptsByFlashcard(
    @Param("flashcardId") flashcardId: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.attemptService.getAttemptsByFlashcard(flashcardId, userId);
  }

  @Get(":id")
  async getAttemptById(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.attemptService.getAttemptById(id, userId);
  }
}
