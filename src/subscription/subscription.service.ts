import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from './paystack.service';
import { QuotaService } from '../common/services/quota.service';
import { PaymentStatus, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly quotaService: QuotaService
  ) {}

  /**
   * Initialize checkout process for a subscription
   * @param userId User ID
   * @param planId Subscription plan ID
   * @param callbackUrl URL to redirect after payment
   * @returns Authorization URL and payment reference
   */
  async checkout(userId: string, planId: string, callbackUrl: string) {
    this.logger.log(
      `Initiating checkout for user ${userId} with plan ${planId}`
    );

    // Validate user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate plan exists and is active
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    if (!plan.isActive) {
      throw new BadRequestException('This subscription plan is not available');
    }

    // Generate unique payment reference
    const reference = `SUB_${userId}_${Date.now()}`;

    // Calculate amount in kobo (Paystack uses kobo for NGN)
    const amountInKobo = Math.round(plan.price * 100);

    this.logger.log(
      `Creating payment record for reference ${reference} - Amount: ${amountInKobo} kobo`
    );

    // Create payment record and subscription placeholder in a transaction
    const payment = await this.prisma.$transaction(async (tx) => {
      // Check if user already has an active subscription
      const existingSubscription = await tx.subscription.findUnique({
        where: { userId },
      });

      // Create or get subscription ID for the payment record
      let subscriptionId: string;

      if (existingSubscription) {
        subscriptionId = existingSubscription.id;
      } else {
        // Create a placeholder subscription that will be activated later
        const newSubscription = await tx.subscription.create({
          data: {
            userId,
            planId,
            status: SubscriptionStatus.EXPIRED, // Temporary status until payment is verified
            currentPeriodEnd: new Date(), // Will be updated on activation
          },
        });
        subscriptionId = newSubscription.id;
      }

      // Create pending payment record
      return tx.payment.create({
        data: {
          userId,
          subscriptionId,
          amount: plan.price,
          paystackReference: reference,
          status: PaymentStatus.PENDING,
        },
      });
    });

    this.logger.log(`Payment record created with ID: ${payment.id}`);

    // Initialize Paystack transaction with bank transfer support
    const paystackResponse = await this.paystackService.initializeTransaction({
      email: user.email,
      amount: amountInKobo,
      reference,
      callback_url: callbackUrl,
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'], // Enable all payment channels including bank transfer
    });

    this.logger.log(
      `Paystack transaction initialized successfully for reference ${reference}`
    );

    return {
      authorizationUrl: paystackResponse.authorization_url,
      reference: paystackResponse.reference,
    };
  }

  /**
   * Verify payment and activate subscription
   * @param reference Paystack payment reference
   * @returns Activated subscription details
   */
  async verifyAndActivate(reference: string) {
    this.logger.log(`Verifying payment with reference: ${reference}`);

    // Early idempotency check - fetch payment record first
    const existingPayment = await this.prisma.payment.findUnique({
      where: { paystackReference: reference },
      include: {
        subscription: {
          include: {
            plan: true,
          },
        },
        user: true,
      },
    });

    if (!existingPayment) {
      throw new NotFoundException('Payment record not found');
    }

    // If payment already successful, return existing subscription immediately
    if (existingPayment.status === PaymentStatus.SUCCESS) {
      this.logger.log(
        `Payment ${reference} already processed. Returning existing subscription.`
      );
      return existingPayment.subscription;
    }

    // Verify payment with Paystack only if not already processed
    const paystackData =
      await this.paystackService.verifyTransaction(reference);

    if (paystackData.status !== 'success') {
      throw new BadRequestException(
        `Payment verification failed. Status: ${paystackData.status}`
      );
    }

    this.logger.log(
      `Activating subscription for user ${existingPayment.userId}`
    );

    // Fetch plan outside transaction to reduce transaction time
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: existingPayment.subscription.planId },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    // Calculate period end date outside transaction
    const now = new Date();
    const periodEnd = new Date(now);

    if (plan.interval === 'monthly') {
      periodEnd.setDate(periodEnd.getDate() + 30);
    } else if (plan.interval === 'yearly') {
      periodEnd.setDate(periodEnd.getDate() + 365);
    } else {
      throw new BadRequestException(`Invalid plan interval: ${plan.interval}`);
    }

    this.logger.log(
      `Calculated period end: ${periodEnd.toISOString()} for interval: ${plan.interval}`
    );

    // Update payment and activate subscription in a transaction with increased timeout
    const subscription = await this.prisma.$transaction(
      async (tx) => {
        // Double-check payment status within transaction to prevent race conditions
        const payment = await tx.payment.findUnique({
          where: { id: existingPayment.id },
        });

        if (payment?.status === PaymentStatus.SUCCESS) {
          this.logger.log(
            `Payment ${reference} was already processed by another request. Skipping.`
          );
          // Fetch and return the subscription
          return await tx.subscription.findUnique({
            where: { userId: existingPayment.userId },
            include: { plan: true },
          });
        }

        // Update payment status
        await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            paidAt: new Date(paystackData.paid_at),
          },
        });

        // Upsert subscription with pre-calculated values
        const activatedSubscription = await tx.subscription.upsert({
          where: { userId: existingPayment.userId },
          create: {
            userId: existingPayment.userId,
            planId: existingPayment.subscription.planId,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
          update: {
            planId: existingPayment.subscription.planId,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
          include: {
            plan: true,
          },
        });

        // Update user quota to premium
        await tx.userQuota.upsert({
          where: { userId: existingPayment.userId },
          create: {
            userId: existingPayment.userId,
            isPremium: true,
          },
          update: {
            isPremium: true,
          },
        });

        return activatedSubscription;
      },
      {
        maxWait: 10000, // Maximum time to wait for a transaction slot (10s)
        timeout: 15000, // Maximum time for the transaction to complete (15s)
      }
    );

    this.logger.log(
      `Subscription activated successfully for user ${existingPayment.userId}`
    );

    return subscription;
  }

  /**
   * Activate or extend a subscription
   * @param userId User ID
   * @param planId Plan ID
   * @param tx Optional transaction client
   * @returns Activated subscription
   */
  private async activateSubscription(userId: string, planId: string, tx?: any) {
    const prismaClient = tx || this.prisma;

    // Fetch plan to get interval
    const plan = await prismaClient.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    // Calculate period end date based on interval
    const now = new Date();
    const periodEnd = new Date(now);

    if (plan.interval === 'monthly') {
      periodEnd.setDate(periodEnd.getDate() + 30);
    } else if (plan.interval === 'yearly') {
      periodEnd.setDate(periodEnd.getDate() + 365);
    } else {
      throw new BadRequestException(`Invalid plan interval: ${plan.interval}`);
    }

    this.logger.log(
      `Calculated period end: ${periodEnd.toISOString()} for interval: ${plan.interval}`
    );

    // Upsert subscription
    const subscription = await prismaClient.subscription.upsert({
      where: { userId },
      create: {
        userId,
        planId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      update: {
        planId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      include: {
        plan: true,
      },
    });

    return subscription;
  }

  /**
   * Cancel subscription at period end
   * @param userId User ID
   * @returns Updated subscription
   */
  async cancelSubscription(userId: string) {
    this.logger.log(`Cancelling subscription for user ${userId}`);

    // Find active subscription
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found for user');
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot cancel a subscription that is not active'
      );
    }

    // Set cancelAtPeriodEnd to true
    const updatedSubscription = await this.prisma.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: true,
      },
      include: {
        plan: true,
      },
    });

    this.logger.log(
      `Subscription marked for cancellation at period end: ${subscription.currentPeriodEnd.toISOString()}`
    );

    return updatedSubscription;
  }

  /**
   * Get user's current subscription
   * @param userId User ID
   * @returns Subscription with plan details or null
   */
  async getMySubscription(userId: string) {
    this.logger.log(`Fetching subscription for user ${userId}`);

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: {
        plan: true,
      },
    });

    return subscription;
  }

  /**
   * Get user's current plan with all quota information
   * Creates a free tier plan if user has no subscription
   * @param userId User ID
   * @returns Current plan details with quota usage
   */
  async getCurrentPlan(userId: string) {
    this.logger.log(`Fetching current plan for user ${userId}`);

    // Get or create subscription
    let subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    // If no subscription exists, create a free tier subscription
    if (!subscription) {
      this.logger.log(
        `No subscription found for user ${userId}, creating free tier`
      );

      // Find the free tier plan
      const freePlan = await this.prisma.subscriptionPlan.findFirst({
        where: {
          price: 0,
          isActive: true,
        },
      });

      if (!freePlan) {
        throw new NotFoundException('Free tier plan not found in database');
      }

      // Create free tier subscription with EXPIRED status (no active period)
      subscription = await this.prisma.subscription.create({
        data: {
          userId,
          planId: freePlan.id,
          status: SubscriptionStatus.EXPIRED,
          currentPeriodEnd: new Date(), // Already expired
          cancelAtPeriodEnd: false,
        },
        include: { plan: true },
      });

      this.logger.log(`Created free tier subscription for user ${userId}`);
    }

    // Get quota status from quota service
    const quotaStatus = await this.quotaService.getQuotaStatus(userId);

    // Build response
    return {
      planName: subscription.plan.name,
      price: subscription.plan.price,
      interval: subscription.plan.interval,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      isPremium: quotaStatus.isPremium,
      quiz: quotaStatus.quiz,
      flashcard: quotaStatus.flashcard,
      explanation: quotaStatus.explanation,
      learningGuide: quotaStatus.learningGuide,
      fileUpload: quotaStatus.fileUpload,
      fileStorage: quotaStatus.fileStorage,
      resetAt: quotaStatus.resetAt,
      monthlyResetAt: quotaStatus.monthlyResetAt,
    };
  }

  /**
   * Handle expired subscriptions - called by cron job
   * Finds ACTIVE subscriptions with currentPeriodEnd < now
   * Updates status to EXPIRED and resets user quotas to free tier
   * @returns Number of subscriptions processed
   */
  async handleExpiredSubscriptions(): Promise<number> {
    this.logger.log('Checking for expired subscriptions...');

    const now = new Date();

    // Find all ACTIVE subscriptions that have expired
    const expiredSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: {
          lt: now,
        },
      },
      include: {
        user: true,
        plan: true,
      },
    });

    if (expiredSubscriptions.length === 0) {
      this.logger.log('No expired subscriptions found.');
      return 0;
    }

    this.logger.log(
      `Found ${expiredSubscriptions.length} expired subscription(s). Processing...`
    );

    // Process each expired subscription in a transaction
    let processedCount = 0;
    for (const subscription of expiredSubscriptions) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Update subscription status to EXPIRED
          await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              status: SubscriptionStatus.EXPIRED,
            },
          });

          this.logger.log(
            `Expired subscription for user ${subscription.user.email} (${subscription.user.name}) - Plan: ${subscription.plan.name}, Period ended: ${subscription.currentPeriodEnd.toISOString()}`
          );
        });

        // Reset user quota to free tier (outside transaction to avoid deadlock)
        await this.quotaService.resetToFreeTier(subscription.userId);

        processedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to process expired subscription ${subscription.id} for user ${subscription.userId}`,
          error
        );
      }
    }

    this.logger.log(
      `Successfully processed ${processedCount} out of ${expiredSubscriptions.length} expired subscription(s).`
    );

    return processedCount;
  }
}
