import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { CacheService } from '../common/services/cache.service';
import {
  UserFilterDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  ContentFilterDto,
  ModerationActionDto,
  CreateSchoolDto,
  UpdateSchoolDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly cacheService: CacheService
  ) {}

  @Delete('content/:id')
  @ApiOperation({ summary: 'Delete content (study material)' })
  deleteContent(@Param('id') id: string) {
    return this.adminService.deleteContent(id);
  }

  @Delete('quiz/:id')
  @ApiOperation({ summary: 'Delete quiz' })
  deleteQuiz(@Param('id') id: string) {
    return this.adminService.deleteQuiz(id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get system statistics' })
  getSystemStats() {
    return this.adminService.getSystemStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all users with filtering' })
  getUsers(@Query() filterDto: UserFilterDto) {
    return this.adminService.getUsers(filterDto);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details' })
  getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Get('users/:id/content')
  @ApiOperation({ summary: "Get user's content" })
  getUserContent(
    @Param('id') id: string,
    @Query() filterDto: ContentFilterDto
  ) {
    return this.adminService.getUserContent(id, filterDto);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Update user status (active/suspended)' })
  updateUserStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateUserStatusDto
  ) {
    return this.adminService.updateUserStatus(id, updateStatusDto);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role' })
  updateUserRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateUserRoleDto
  ) {
    return this.adminService.updateUserRole(id, updateRoleDto);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete user' })
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Get('content')
  @ApiOperation({ summary: 'Get all content (quizzes)' })
  getAllContent(@Query() filterDto: ContentFilterDto) {
    return this.adminService.getAllContent(filterDto);
  }

  @Get('flashcards')
  @ApiOperation({ summary: 'Get all flashcards' })
  getAllFlashcards(@Query() filterDto: ContentFilterDto) {
    return this.adminService.getAllFlashcards(filterDto);
  }

  @Get('challenges')
  @ApiOperation({ summary: 'Get all challenges' })
  getAllChallenges(@Query() filterDto: ContentFilterDto) {
    return this.adminService.getAllChallenges(filterDto);
  }

  @Get('content/reports')
  @ApiOperation({ summary: 'Get reported content' })
  getReportedContent() {
    return this.adminService.getReportedContent();
  }

  @Post('content/:id/moderate')
  @ApiOperation({ summary: 'Moderate content' })
  moderateContent(
    @Param('id') id: string,
    @Body() actionDto: ModerationActionDto
  ) {
    return this.adminService.moderateContent(id, actionDto);
  }

  @Get('schools')
  @ApiOperation({ summary: 'Get all schools' })
  getSchools() {
    return this.adminService.getSchools();
  }

  @Post('schools')
  @ApiOperation({ summary: 'Create a new school' })
  createSchool(@Body() createSchoolDto: CreateSchoolDto) {
    return this.adminService.createSchool(createSchoolDto);
  }

  @Patch('schools/:id')
  @ApiOperation({ summary: 'Update a school' })
  updateSchool(
    @Param('id') id: string,
    @Body() updateSchoolDto: UpdateSchoolDto
  ) {
    return this.adminService.updateSchool(id, updateSchoolDto);
  }

  @Get('ai-analytics')
  @ApiOperation({ summary: 'Get generation analytics' })
  getAiAnalytics() {
    return this.adminService.getAiAnalytics();
  }

  @Delete('flashcard/:id')
  @ApiOperation({ summary: 'Delete flashcard set' })
  deleteFlashcardSet(@Param('id') id: string) {
    return this.adminService.deleteFlashcardSet(id);
  }

  @Post('challenges')
  @ApiOperation({ summary: 'Create a new challenge' })
  createChallenge(@Body() createChallengeDto: any) {
    return this.adminService.createChallenge(createChallengeDto);
  }

  @Delete('challenges/:id')
  @ApiOperation({ summary: 'Delete a challenge' })
  deleteChallenge(@Param('id') id: string) {
    return this.adminService.deleteChallenge(id);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get comprehensive analytics' })
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  @Post('challenges/generate/daily')
  @ApiOperation({ summary: 'Manually generate daily challenges' })
  async generateDailyChallenges() {
    return this.adminService.generateDailyChallenges();
  }

  @Post('challenges/generate/weekly')
  @ApiOperation({ summary: 'Manually generate weekly challenges' })
  async generateWeeklyChallenges() {
    return this.adminService.generateWeeklyChallenges();
  }

  @Post('challenges/generate/monthly')
  @ApiOperation({ summary: 'Manually generate monthly challenges' })
  async generateMonthlyChallenges() {
    return this.adminService.generateMonthlyChallenges();
  }

  @Post('challenges/generate/hot')
  @ApiOperation({ summary: 'Manually generate hot challenges' })
  async generateHotChallenges() {
    return this.adminService.generateHotChallenges();
  }

  @Get('subscription-stats')
  @ApiOperation({ summary: 'Get subscription statistics' })
  getSubscriptionStats() {
    return this.adminService.getSubscriptionStats();
  }

  @Get('quota-stats')
  @ApiOperation({ summary: 'Get quota usage statistics' })
  getQuotaStats() {
    return this.adminService.getQuotaStats();
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'Get all user subscriptions' })
  getAllSubscriptions(@Query() filterDto: any) {
    return this.adminService.getAllSubscriptions(filterDto);
  }

  @Get('subscription-plans')
  @ApiOperation({ summary: 'Get all subscription plans' })
  getSubscriptionPlans() {
    return this.adminService.getSubscriptionPlans();
  }

  @Post('subscription-plans')
  @ApiOperation({ summary: 'Create subscription plan' })
  async createSubscriptionPlan(@Body() createPlanDto: any) {
    const result =
      await this.adminService.createSubscriptionPlan(createPlanDto);
    await this.clearPlansCache();
    return result;
  }

  @Patch('subscription-plans/:id')
  @ApiOperation({ summary: 'Update subscription plan' })
  async updateSubscriptionPlan(
    @Param('id') id: string,
    @Body() updatePlanDto: any
  ) {
    const result = await this.adminService.updateSubscriptionPlan(
      id,
      updatePlanDto
    );
    await this.clearPlansCache();
    return result;
  }

  @Delete('subscription-plans/:id')
  @ApiOperation({ summary: 'Delete/deactivate subscription plan' })
  async deleteSubscriptionPlan(@Param('id') id: string) {
    const result = await this.adminService.deleteSubscriptionPlan(id);
    await this.clearPlansCache();
    return result;
  }

  @Get('users/:id/quota')
  @ApiOperation({ summary: 'Get user quota status' })
  getUserQuota(@Param('id') id: string) {
    return this.adminService.getUserQuota(id);
  }

  /**
   * Clear subscription plans cache
   * Call this method when plans are created, updated, or deleted to ensure fresh data
   * @private
   */
  private async clearPlansCache(): Promise<void> {
    try {
      await this.cacheService.invalidate('/subscription/plans');
      this.logger.log('Subscription plans cache cleared');
    } catch (error) {
      this.logger.error(
        `Error clearing plans cache: ${error.message}`,
        error.stack
      );
    }
  }
}
