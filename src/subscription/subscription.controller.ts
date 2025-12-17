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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import * as crypto from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CheckoutDto,
  CheckoutResponseDto,
  WebhookEventDto,
  SubscriptionResponseDto,
  CancelSubscriptionResponseDto,
  PlanDetailsDto,
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
   */
  @Get('plans')
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
   * Handle Paystack webhook events
   * Public endpoint - validates signature
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Paystack webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  async handleWebhook(
    @Body() webhookEvent: WebhookEventDto,
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request
  ): Promise<{ message: string }> {
    this.logger.log(`Received webhook event: ${webhookEvent.event}`);

    // Verify Paystack signature
    const isValid = this.verifyPaystackSignature(
      JSON.stringify(req.body),
      signature
    );

    if (!isValid) {
      this.logger.warn(
        'Invalid webhook signature. Possible unauthorized webhook call.'
      );
      // Return 200 to acknowledge receipt even with invalid signature
      // This prevents Paystack from retrying
      return { message: 'Webhook received' };
    }

    // Handle charge.success event
    if (webhookEvent.event === 'charge.success') {
      const reference = webhookEvent.data?.reference;

      if (!reference) {
        this.logger.error('Webhook event missing payment reference');
        return { message: 'Webhook received' };
      }

      this.logger.log(`Processing successful payment: ${reference}`);

      try {
        await this.subscriptionService.verifyAndActivate(reference);
        this.logger.log(`Subscription activated for payment: ${reference}`);
      } catch (error) {
        this.logger.error(
          `Failed to activate subscription for payment ${reference}: ${error.message}`,
          error.stack
        );
        // Still return 200 to acknowledge receipt
      }
    } else {
      this.logger.log(`Ignoring webhook event: ${webhookEvent.event}`);
    }

    return { message: 'Webhook received' };
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
