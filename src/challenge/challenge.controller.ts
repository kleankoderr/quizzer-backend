import { Controller, Get, Post, Body, UseGuards, Param } from "@nestjs/common";
import { ChallengeService } from "./challenge.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("challenges")
@UseGuards(JwtAuthGuard)
class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  @Get()
  async getAllChallenges(@CurrentUser("sub") userId: string) {
    return this.challengeService.getAllChallenges(userId);
  }

  @Get("daily")
  async getDailyChallenges(@CurrentUser("sub") userId: string) {
    return this.challengeService.getDailyChallenges(userId);
  }

  @Get("hot")
  async getHotChallenges(@CurrentUser("sub") userId: string) {
    return this.challengeService.getHotChallenges(userId);
  }

  @Get("weekly")
  async getWeeklyChallenges(@CurrentUser("sub") userId: string) {
    return this.challengeService.getWeeklyChallenges(userId);
  }

  @Get("monthly")
  async getMonthlyChallenges(@CurrentUser("sub") userId: string) {
    return this.challengeService.getMonthlyChallenges(userId);
  }

  @Post("complete")
  async completeChallenge(
    @CurrentUser("sub") userId: string,
    @Body() body: { challengeId: string },
  ) {
    return this.challengeService.completeChallenge(body.challengeId, userId);
  }

  @Post("join")
  async joinChallenge(
    @CurrentUser("sub") userId: string,
    @Body() body: { challengeId: string },
  ) {
    return this.challengeService.joinChallenge(body.challengeId, userId);
  }

  @Post("leave")
  async leaveChallenge(
    @CurrentUser("sub") userId: string,
    @Body() body: { challengeId: string },
  ) {
    return this.challengeService.leaveChallenge(body.challengeId, userId);
  }

  @Get(":id")
  async getChallengeById(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.challengeService.getChallengeById(id, userId);
  }

  @Post(":id/start")
  async startChallenge(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.challengeService.startChallenge(id, userId);
  }

  @Post(":id/quiz/:quizId/complete")
  async completeQuizInChallenge(
    @Param("id") challengeId: string,
    @Param("quizId") quizId: string,
    @CurrentUser("sub") userId: string,
    @Body()
    attemptData: { score: number; totalQuestions: number; attemptId: string },
  ) {
    return this.challengeService.completeQuizInChallenge(
      challengeId,
      quizId,
      userId,
      attemptData,
    );
  }

  @Get(":id/progress")
  async getChallengeProgress(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.challengeService.getChallengeProgress(id, userId);
  }

  @Get(":id/leaderboard")
  async getChallengeLeaderboard(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.challengeService.getChallengeLeaderboard(id, userId);
  }
}

export default ChallengeController;
