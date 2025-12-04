import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
} from "@nestjs/common";
import { AssessmentService } from "./assessment.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("assessment")
@UseGuards(JwtAuthGuard)
export class AssessmentController {
  private readonly logger = new Logger(AssessmentController.name);

  constructor(private readonly assessmentService: AssessmentService) {}

  @Get("performance")
  async getPerformance(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /assessment/performance - User: ${userId}`);
    return this.assessmentService.analyzePerformance(userId);
  }

  @Get("quiz-recommendations")
  async getQuizRecommendations(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /assessment/quiz-recommendations - User: ${userId}`);
    return this.assessmentService.recommendQuizTypes(userId);
  }

  @Get("quiz-timing")
  async getQuizTiming(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /assessment/quiz-timing - User: ${userId}`);
    return this.assessmentService.suggestQuizTiming(userId);
  }

  @Get("difficulty/:topic")
  async getDifficulty(@Req() req: any, @Param("topic") topic: string) {
    const userId = req.user.userId;
    this.logger.log(`GET /assessment/difficulty/${topic} - User: ${userId}`);
    return {
      topic,
      difficulty: await this.assessmentService.adjustDifficulty(userId, topic),
    };
  }

  @Get("weak-areas")
  async getWeakAreas(@Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(`GET /assessment/weak-areas - User: ${userId}`);
    return this.assessmentService.getWeakAreas(userId, false);
  }

  @Post("weak-areas/:id/resolve")
  async resolveWeakArea(@Param("id") id: string, @Req() req: any) {
    const userId = req.user.userId;
    this.logger.log(
      `POST /assessment/weak-areas/${id}/resolve - User: ${userId}`,
    );
    return this.assessmentService.resolveWeakArea(id);
  }

  @Post("track-weak-areas")
  async trackWeakAreas(
    @Req() req: any,
    @Body() body: { topic: string; answers: any[] },
  ) {
    const userId = req.user.userId;
    this.logger.log(
      `POST /assessment/track-weak-areas - User: ${userId}, Topic: ${body.topic}`,
    );
    await this.assessmentService.trackWeakAreas(
      userId,
      body.topic,
      body.answers,
    );
    return { success: true };
  }
}
