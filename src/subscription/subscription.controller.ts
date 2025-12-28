import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Logger,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UnauthorizedException,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import * as crypto from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CheckoutDto,
  CheckoutResponseDto,
  WebhookEventDto,
  SubscriptionResponseDto,
  CancelSubscriptionResponseDto,
  PlanDetailsDto,
  VerifyPaymentDto,
  CurrentPlanResponseDto,
  ScheduleDowngradeDto,
} from './dto/subscription.dto';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);
  private readonly paystackSecretKey: string;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly configService: ConfigService
  ) {
    this.paystackSecretKey = this.configService.get<string>(
      'PAYSTACK_SECRET_KEY'
    );
    if (!this.paystackSecretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY is not configured. Webhook verification will fail.'
      );
    }
  }

  /**
   * Get all active subscription plans
   * Public endpoint - no authentication required
   * Cached for 1 hour to improve performance
   */
  @Get('plans')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Get all active subscription plans' })
  @ApiResponse({
    status: 200,
    description: 'List of active subscription plans',
    type: [PlanDetailsDto],
  })
  async getPlans(): Promise<PlanDetailsDto[]> {
    this.logger.log('Fetching all active subscription plans');

    const plans = await this.subscriptionService[
      'prisma'
    ].subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      interval: plan.interval,
      quotas: plan.quotas as Record<string, any>,
      isActive: plan.isActive,
    }));
  }

  /**
   * Initialize subscription checkout
   * Protected endpoint - requires authentication
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize subscription checkout' })
  @ApiResponse({
    status: 201,
    description: 'Checkout initialized successfully',
    type: CheckoutResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid plan ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkout(
    @CurrentUser('sub') userId: string,
    @Body() checkoutDto: CheckoutDto
  ): Promise<CheckoutResponseDto> {
    this.logger.log(
      `User ${userId} initiating checkout for plan ${checkoutDto.planId}`
    );

    try {
      const result = await this.subscriptionService.checkout(
        userId,
        checkoutDto.planId,
        checkoutDto.callbackUrl
      );

      return {
        authorizationUrl: result.authorizationUrl,
        reference: result.reference,
        message: 'Checkout initialized successfully',
      };
    } catch (error) {
      this.logger.error(
        `Checkout failed for user ${userId}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Verify Paystack payment
   * Protected endpoint - requires authentication
   */
  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify Paystack payment' })
  @ApiResponse({
    status: 200,
    description: 'Payment verified and subscription activated',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized to verify this payment',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment record not found',
  })
  async verifyPayment(
    @CurrentUser('sub') userId: string,
    @Body() verifyPaymentDto: VerifyPaymentDto
  ): Promise<SubscriptionResponseDto> {
    this.logger.log(
      `User ${userId} verifying payment: ${verifyPaymentDto.reference}`
    );
    const subscription = await this.subscriptionService.verifyAndActivate(
      verifyPaymentDto.reference,
      userId
    );

    return {
      id: subscription.id,
      userId: subscription.userId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        price: subscription.plan.price,
        interval: subscription.plan.interval,
        quotas: subscription.plan.quotas as Record<string, any>,
        isActive: subscription.plan.isActive,
      },
    };
  }

  /**
   * Handle Paystack webhook events
   * Public endpoint - validates signature
   */
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per 60 seconds
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Paystack webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async handleWebhook(
    @Body() webhookEvent: WebhookEventDto,
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request
  ): Promise<{ message: string }> {
    this.logger.log(`Received webhook event: ${webhookEvent.event}`);

    // Step 1: Verify Paystack signature
    const isValid = this.verifyPaystackSignature(
      JSON.stringify(req.body),
      signature
    );

    if (!isValid) {
      this.logger.error(
        'Invalid webhook signature - potential security threat',
        {
          event: webhookEvent.event,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        }
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Log successful signature verification
    this.logger.log(
      `Webhook signature verified successfully for event: ${webhookEvent.event}`,
      {
        ip: req.ip,
        reference: webhookEvent.data?.reference,
      }
    );

    return this.subscriptionService.processWebhookEvent(webhookEvent, {
      ip: req.ip,
    });
  }

  /**
   * Get current user's subscription
   * Protected endpoint - requires authentication
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user subscription' })
  @ApiResponse({
    status: 200,
    description: 'User subscription details',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMySubscription(
    @CurrentUser('sub') userId: string
  ): Promise<SubscriptionResponseDto | null> {
    this.logger.log(`Fetching subscription for user ${userId}`);

    const subscription =
      await this.subscriptionService.getMySubscription(userId);

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      userId: subscription.userId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        price: subscription.plan.price,
        interval: subscription.plan.interval,
        quotas: subscription.plan.quotas as Record<string, any>,
        isActive: subscription.plan.isActive,
      },
    };
  }

  /**
   * Get current user's plan with all quota information
   * Protected endpoint - requires authentication
   * Creates a free tier plan if user has no subscription
   */
  @Get('current-plan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current plan with quota information' })
  @ApiResponse({
    status: 200,
    description: 'Current plan details with quota usage',
    type: CurrentPlanResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentPlan(
    @CurrentUser('sub') userId: string
  ): Promise<CurrentPlanResponseDto> {
    this.logger.log(`Fetching current plan for user ${userId}`);
    return this.subscriptionService.getCurrentPlan(userId);
  }

  /**
   * Cancel user's subscription
   * Protected endpoint - requires authentication
   */
  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  @ApiResponse({
    status: 200,
    description: 'Subscription cancelled successfully',
    type: CancelSubscriptionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'No active subscription found' })
  async cancelSubscription(
    @CurrentUser('sub') userId: string
  ): Promise<CancelSubscriptionResponseDto> {
    this.logger.log(`User ${userId} requesting subscription cancellation`);

    const subscription =
      await this.subscriptionService.cancelSubscription(userId);

    return {
      message:
        'Subscription will be cancelled at the end of the current period',
      subscription: {
        id: subscription.id,
        userId: subscription.userId,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          price: subscription.plan.price,
          interval: subscription.plan.interval,
          quotas: subscription.plan.quotas as Record<string, any>,
          isActive: subscription.plan.isActive,
        },
      },
    };
  }

  /**
   * Schedule a subscription downgrade
   * Protected endpoint - requires authentication
   */
  @Post('schedule-downgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Schedule a subscription downgrade for end of period',
  })
  @ApiResponse({
    status: 200,
    description: 'Downgrade scheduled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid plan or usage exceeds limits',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async scheduleDowngrade(
    @CurrentUser('sub') userId: string,
    @Body() scheduleDowngradeDto: ScheduleDowngradeDto
  ) {
    this.logger.log(
      `User ${userId} scheduling downgrade to plan ${scheduleDowngradeDto.planId}`
    );
    return this.subscriptionService.scheduleDowngrade(
      userId,
      scheduleDowngradeDto.planId
    );
  }

  /**
   * Get recent payment failures (Admin only)
   * Protected endpoint - requires authentication and admin role
   */
  @Get('admin/payment-failures')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent payment failures (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of recent payment failures with user information',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 50)',
  })
  async getPaymentFailures(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
  ) {
    this.logger.log(
      `Admin requesting payment failures (page: ${page}, limit: ${limit})`
    );
    return this.subscriptionService.getRecentPaymentFailures(page, limit);
  }

  /**
   * Get payment method statistics (Admin only)
   * Protected endpoint - requires authentication and admin role
   */
  @Get('admin/payment-stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment method statistics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Payment method statistics',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getPaymentStats() {
    this.logger.log('Admin requesting payment method statistics');
    return this.subscriptionService.getPaymentMethodStats();
  }

  /**
   * Verify Paystack webhook signature using HMAC SHA512
   * @param payload Raw request body as string
   * @param signature Signature from x-paystack-signature header
   * @returns True if signature is valid
   */
  private verifyPaystackSignature(payload: string, signature: string): boolean {
    if (!signature || !this.paystackSecretKey) {
      return false;
    }

    try {
      const hash = crypto
        .createHmac('sha512', this.paystackSecretKey)
        .update(payload)
        .digest('hex');

      return hash === signature;
    } catch (error) {
      this.logger.error(
        `Error verifying webhook signature: ${error.message}`,
        error.stack
      );
      return false;
    }
  }
}
