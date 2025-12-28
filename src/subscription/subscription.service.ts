import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from './paystack.service';
import { QuotaService } from '../common/services/quota.service';
import { LockService } from '../common/services/lock.service';
import { PaymentStatus, SubscriptionStatus } from '@prisma/client';
import { Lock } from 'redlock';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  private readonly cleanupMetrics = {
    lastRun: null as Date | null,
    totalCleaned: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly quotaService: QuotaService,
    private readonly lockService: LockService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
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

    // Check if user has existing subscription to validate downgrade
    const currentSubscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (
      currentSubscription &&
      currentSubscription.status === SubscriptionStatus.ACTIVE
    ) {
      // Determine if upgrade or downgrade
      const isDowngrade = plan.price < currentSubscription.plan.price;

      if (isDowngrade) {
        // Validate current usage against new plan limits
        await this.validateDowngrade(userId, plan);
      }
    }

    // Generate unique payment reference
    const reference = `SUB_${userId}_${Date.now()}`;

    // Convert price from Naira to Kobo for Paystack API (Paystack requires amount in kobo)
    const amountInKobo = Math.round(plan.price * 100);

    this.logger.log(
      `Creating payment record for reference ${reference} - Amount: ${amountInKobo} kobo (₦${plan.price})`
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
            status: SubscriptionStatus.PENDING_PAYMENT, // Temporary status until payment is verified
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
   * Validate if a user can downgrade to a new plan based on current usage
   * @param userId User ID
   * @param newPlan Target subscription plan
   */
  private async validateDowngrade(userId: string, newPlan: any): Promise<void> {
    const quotaStatus = await this.quotaService.getQuotaStatus(userId);
    const newQuotas = newPlan.quotas;

    const violations: string[] = [];

    // Check quiz quota
    if (quotaStatus.quiz.used > newQuotas.quizzes) {
      violations.push(
        `Quizzes: You've used ${quotaStatus.quiz.used} but new plan allows ${newQuotas.quizzes}`
      );
    }

    // Check flashcard quota
    if (quotaStatus.flashcard.used > newQuotas.flashcards) {
      violations.push(
        `Flashcards: You've used ${quotaStatus.flashcard.used} but new plan allows ${newQuotas.flashcards}`
      );
    }

    // Check storage quota (convert MB to bytes if needed, but assuming both are in MB based on context)
    // quotaStatus.fileStorage.used is likely in MB, newQuotas.storageLimitMB is in MB
    if (quotaStatus.fileStorage.used > newQuotas.storageLimitMB) {
      violations.push(
        `Storage: You're using ${quotaStatus.fileStorage.used}MB but new plan allows ${newQuotas.storageLimitMB}MB`
      );
    }

    if (violations.length > 0) {
      throw new BadRequestException({
        message: 'Cannot downgrade: Current usage exceeds new plan limits',
        violations,
      });
    }
  }

  /**
   * Schedule a downgrade for the end of the current billing period
   * @param userId User ID
   * @param newPlanId New Plan ID
   * @returns Scheduled downgrade details
   */
  async scheduleDowngrade(userId: string, newPlanId: string) {
    this.logger.log(
      `Scheduling downgrade for user ${userId} to plan ${newPlanId}`
    );

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        'Subscription must be active to schedule a downgrade'
      );
    }

    const newPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: newPlanId },
    });

    if (!newPlan) {
      throw new NotFoundException('New subscription plan not found');
    }

    // Validate downgrade eligibility
    await this.validateDowngrade(userId, newPlan);

    // Update subscription with pending plan
    await this.prisma.subscription.update({
      where: { userId },
      data: {
        pendingPlanId: newPlanId,
        // Ensure we don't accidentally cancel, though usually downgrade implies continuing on a cheaper plan
        cancelAtPeriodEnd: false,
      },
    });

    this.logger.log(
      `Downgrade scheduled for user ${userId} to plan ${newPlan.name} at ${subscription.currentPeriodEnd.toISOString()}`
    );

    return {
      message: 'Downgrade scheduled for end of current billing period',
      currentPeriodEnd: subscription.currentPeriodEnd,
      newPlan: {
        name: newPlan.name,
        price: newPlan.price,
      },
    };
  }

  /**
   * Verify payment and activate subscription
   * @param reference Paystack payment reference
   * @param requestingUserId
   * @returns Activated subscription details
   */
  async verifyAndActivate(reference: string, requestingUserId?: string) {
    const lockKey = `payment:verify:${reference}`;
    let lock: Lock;

    try {
      // Acquire distributed lock to prevent race conditions
      lock = await this.lockService.acquireLock(lockKey, 30000); // 30s TTL
      this.logger.log(`Acquired lock for payment verification: ${reference}`);
    } catch (_error) {
      this.logger.warn(
        `Could not acquire lock for ${reference}, verification in progress`
      );
      throw new ConflictException(
        'Payment verification already in progress. Please wait and try again.'
      );
    }

    try {
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

      // Validate ownership if called from authenticated endpoint
      if (requestingUserId && existingPayment.userId !== requestingUserId) {
        this.logger.warn(
          `User ${requestingUserId} attempted to verify payment belonging to ${existingPayment.userId}`,
          {
            reference,
            requestingUserId,
            actualUserId: existingPayment.userId,
            timestamp: new Date().toISOString(),
          }
        );
        throw new ForbiddenException(
          'You are not authorized to verify this payment'
        );
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
        await this.markPaymentAsFailed(
          existingPayment.id,
          `Paystack status: ${paystackData.status}`
        );
        throw new BadRequestException(
          `Payment verification failed. Status: ${paystackData.status}`
        );
      }

      // Currency validation
      if (paystackData.currency !== 'NGN') {
        this.logger.error(
          `Invalid currency for payment ${reference}: ${paystackData.currency}`,
          {
            expected: 'NGN',
            received: paystackData.currency,
            amount: paystackData.amount,
          }
        );
        await this.markPaymentAsFailed(
          existingPayment.id,
          `Invalid currency: ${paystackData.currency}`
        );
        throw new BadRequestException(
          `Invalid payment currency. Expected NGN, received ${paystackData.currency}`
        );
      }

      this.logger.log(
        `Activating subscription for user ${existingPayment.userId}`
      );

      // Fetch plan for amount validation (before transaction)
      const plan = await this.prisma.subscriptionPlan.findUnique({
        where: { id: existingPayment.subscription.planId },
      });

      if (!plan) {
        throw new NotFoundException('Subscription plan not found');
      }

      // Amount validation
      const planPriceInKobo = Math.round(plan.price * 100);
      const paidAmountInKobo = paystackData.amount;

      if (paidAmountInKobo < planPriceInKobo) {
        this.logger.error(`Amount mismatch for payment ${reference}`, {
          expectedKobo: planPriceInKobo,
          expectedNaira: plan.price,
          receivedKobo: paidAmountInKobo,
          receivedNaira: paidAmountInKobo / 100,
          planId: plan.id,
          planName: plan.name,
        });
        await this.markPaymentAsFailed(
          existingPayment.id,
          `Amount mismatch: expected ${planPriceInKobo} kobo, received ${paidAmountInKobo} kobo`
        );
        throw new BadRequestException(
          `Payment amount insufficient. Expected: ₦${plan.price}, Received: ₦${paidAmountInKobo / 100}`
        );
      }

      this.logger.log(
        `Payment validated successfully: ${paidAmountInKobo} kobo (₦${plan.price}) in ${paystackData.currency}`
      );

      // Calculate period end date outside transaction
      const now = new Date();
      const periodEnd = new Date(now);

      if (plan.interval === 'monthly') {
        periodEnd.setDate(periodEnd.getDate() + 30);
      } else if (plan.interval === 'yearly') {
        periodEnd.setDate(periodEnd.getDate() + 365);
      } else {
        throw new BadRequestException(
          `Invalid plan interval: ${plan.interval}`
        );
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

          await tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: PaymentStatus.SUCCESS,
              paidAt: new Date(paystackData.paid_at),
              paymentChannel: paystackData.channel,
              paymentMethod: paystackData.authorization
                ? (paystackData.authorization as any)
                : undefined,
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

          // Reset user quotas for new billing period
          await tx.userQuota.upsert({
            where: { userId: existingPayment.userId },
            create: {
              userId: existingPayment.userId,
              monthlyResetAt: periodEnd,
              // All counts default to 0
            },
            update: {
              monthlyResetAt: periodEnd,
              // Reset all counts to 0 for new billing period
              monthlyQuizCount: 0,
              monthlyFlashcardCount: 0,
              monthlyStudyMaterialCount: 0,
              monthlyConceptExplanationCount: 0,
              monthlySmartRecommendationCount: 0,
              monthlySmartCompanionCount: 0,
              monthlyWeakAreaAnalysisCount: 0,
              monthlyFileUploadCount: 0,
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
    } finally {
      // Always release the lock, even if verification fails
      if (lock) {
        try {
          await (lock as any).unlock();
          this.logger.log(
            `Released lock for payment verification: ${reference}`
          );
        } catch (releaseError) {
          this.logger.error(
            `Failed to release lock for ${reference}:`,
            releaseError
          );
        }
      }
    }
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
      studyMaterial: quotaStatus.studyMaterial,
      conceptExplanation: quotaStatus.conceptExplanation,
      smartRecommendation: quotaStatus.smartRecommendation,
      smartCompanion: quotaStatus.smartCompanion,
      fileUpload: quotaStatus.fileUpload,
      fileStorage: quotaStatus.fileStorage,
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
          // Check for pending plan change (downgrade/upgrade scheduled)
          if (subscription.pendingPlanId) {
            const newPlan = await tx.subscriptionPlan.findUnique({
              where: { id: subscription.pendingPlanId },
            });

            if (newPlan) {
              // Apply the plan change
              const isFree = newPlan.price === 0;

              await tx.subscription.update({
                where: { id: subscription.id },
                data: {
                  status: isFree
                    ? SubscriptionStatus.ACTIVE
                    : SubscriptionStatus.EXPIRED,
                  planId: subscription.pendingPlanId,
                  pendingPlanId: null, // Clear pending plan
                  // If free, extend period. If paid, remains expired until payment.
                  currentPeriodEnd: isFree
                    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    : subscription.currentPeriodEnd,
                },
              });

              this.logger.log(
                `Applied scheduled plan change for user ${subscription.user.email} to ${newPlan.name} (${isFree ? 'Free - Auto Activated' : 'Paid - Pending Payment'})`
              );
            } else {
              // Plan not found, valid fallback or just expire
              await tx.subscription.update({
                where: { id: subscription.id },
                data: { status: SubscriptionStatus.EXPIRED },
              });
            }
          } else {
            // No pending change, just expire
            await tx.subscription.update({
              where: { id: subscription.id },
              data: {
                status: SubscriptionStatus.EXPIRED,
              },
            });
          }

          this.logger.log(
            `Processed expiration for user ${subscription.user.email} (${subscription.user.name})`
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

  /**
   * Mark payment as failed with reason
   * @param paymentId Payment ID
   * @param reason Failure reason
   */
  private async markPaymentAsFailed(
    paymentId: string,
    reason: string
  ): Promise<void> {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: reason,
      },
    });
    this.logger.log(`Payment ${paymentId} marked as FAILED: ${reason}`);
  }

  /**
   * Renew subscription and reset quotas for new billing period
   * @param userId User ID
   * @param newPeriodEnd New subscription period end date
   * @returns Updated subscription
   */
  async renewSubscription(userId: string, newPeriodEnd: Date): Promise<any> {
    this.logger.log(
      `Renewing subscription for user ${userId}, new period end: ${newPeriodEnd.toISOString()}`
    );

    return await this.prisma.$transaction([
      // Update subscription
      this.prisma.subscription.update({
        where: { userId },
        data: { currentPeriodEnd: newPeriodEnd },
      }),

      // Reset quotas for new billing period
      this.prisma.userQuota.update({
        where: { userId },
        data: {
          monthlyResetAt: newPeriodEnd,
          monthlyQuizCount: 0,
          monthlyFlashcardCount: 0,
          monthlyStudyMaterialCount: 0,
          monthlyConceptExplanationCount: 0,
          monthlySmartRecommendationCount: 0,
          monthlySmartCompanionCount: 0,
          monthlyWeakAreaAnalysisCount: 0,
          monthlyFileUploadCount: 0,
        },
      }),
    ]);
  }

  /**
   * Clean up abandoned pending payments older than 24 hours
   * @returns Number of payments marked as failed
   */
  async cleanupAbandonedPayments(): Promise<number> {
    this.logger.log('Cleaning up abandoned pending payments...');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.payment.updateMany({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: { lt: oneDayAgo },
      },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Payment abandoned - timeout',
      },
    });

    this.logger.log(`Marked ${result.count} abandoned payments as failed`);

    // Update metrics
    this.cleanupMetrics.lastRun = new Date();
    this.cleanupMetrics.totalCleaned += result.count;

    return result.count;
  }

  /**
   * Get payment cleanup metrics
   * @returns Cleanup metrics
   */
  getCleanupMetrics() {
    return {
      ...this.cleanupMetrics,
      totalCleaned: this.cleanupMetrics.totalCleaned,
      lastRun: this.cleanupMetrics.lastRun?.toISOString() || null,
    };
  }

  /**
   * Process webhook event with deduplication and validation
   * @param webhookEvent Webhook event data
   * @param eventMetadata Additional metadata (IP, etc.)
   * @returns Processing result message
   */
  async processWebhookEvent(
    webhookEvent: { event: string; data?: any },
    eventMetadata?: { ip?: string }
  ): Promise<{ message: string }> {
    this.logger.log(`Processing webhook event: ${webhookEvent.event}`);

    const eventId = webhookEvent.data?.id;

    // Step 1: Event deduplication check
    if (eventId) {
      const isDuplicate = await this.checkEventDuplicate(eventId);
      if (isDuplicate) {
        this.logger.log(`Duplicate webhook event ${eventId}, ignoring`, {
          event: webhookEvent.event,
          reference: webhookEvent.data?.reference,
        });
        return { message: 'Event already processed' };
      }

      // Mark as processing (short TTL to handle failures)
      await this.cacheManager.set(
        `webhook:processed:${eventId}`,
        'processing',
        300
      );
    } else {
      this.logger.warn('Webhook event missing ID, cannot deduplicate');
    }

    // Step 2: Timestamp validation (reject old events)
    const isEventTooOld = this.validateEventTimestamp(
      webhookEvent.data?.created_at
    );
    if (isEventTooOld) {
      this.logger.warn(`Rejecting old webhook event`, {
        eventId,
        event: webhookEvent.event,
      });
      return { message: 'Event too old' };
    }

    this.logger.log(
      `Webhook event validated successfully: ${webhookEvent.event}`,
      {
        ip: eventMetadata?.ip,
        reference: webhookEvent.data?.reference,
        eventId,
      }
    );

    // Step 3: Handle charge.success event
    if (webhookEvent.event === 'charge.success') {
      await this.handleChargeSuccess(webhookEvent.data, eventId);
    } else {
      this.logger.log(`Ignoring webhook event: ${webhookEvent.event}`);
    }

    return { message: 'Webhook received' };
  }

  /**
   * Check if webhook event has already been processed
   * @param eventId Event ID
   * @returns True if event is a duplicate
   */
  private async checkEventDuplicate(eventId: string): Promise<boolean> {
    const cacheKey = `webhook:processed:${eventId}`;
    const alreadyProcessed = await this.cacheManager.get(cacheKey);
    return !!alreadyProcessed;
  }

  /**
   * Validate webhook event timestamp
   * @param createdAt Event creation timestamp
   * @returns True if event is too old (>60 minutes)
   */
  private validateEventTimestamp(createdAt?: string): boolean {
    if (!createdAt) {
      this.logger.warn('Webhook event missing timestamp');
      return false;
    }

    const eventTimestamp = new Date(createdAt);
    const ageInMinutes = (Date.now() - eventTimestamp.getTime()) / 1000 / 60;

    return ageInMinutes > 60;
  }

  /**
   * Handle charge.success webhook event
   * @param eventData Webhook event data
   * @param eventId Event ID for deduplication
   */
  private async handleChargeSuccess(
    eventData: any,
    eventId?: string
  ): Promise<void> {
    const reference = eventData?.reference;

    if (!reference) {
      this.logger.error('Webhook event missing payment reference');
      return;
    }

    this.logger.log(`Processing successful payment: ${reference}`);

    try {
      await this.verifyAndActivate(reference);
      this.logger.log(`Subscription activated for payment: ${reference}`);

      // Mark as successfully processed (24h TTL)
      if (eventId) {
        await this.cacheManager.set(
          `webhook:processed:${eventId}`,
          'completed',
          86400 // 24 hours
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to activate subscription for payment ${reference}: ${error.message}`,
        error.stack
      );
      // Don't throw - webhook should still return 200
    }
  }

  /**
   * Get recent payment failures for admin analytics (paginated)
   * @param page Page number (default: 1)
   * @param limit Maximum number of failures to return (default: 50)
   * @returns Recent payment failures with pagination metadata
   */
  async getRecentPaymentFailures(page: number = 1, limit: number = 50) {
    this.logger.log(
      `Fetching recent payment failures (page: ${page}, limit: ${limit})`
    );

    const skip = (page - 1) * limit;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.payment.count({
        where: { status: PaymentStatus.FAILED },
      }),
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.FAILED },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
          subscription: {
            include: {
              plan: {
                select: {
                  name: true,
                  price: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get payment method statistics
   */
  async getPaymentMethodStats() {
    const stats = await this.prisma.payment.groupBy({
      by: ['paymentChannel'],
      where: { status: PaymentStatus.SUCCESS },
      _count: { id: true },
      _sum: { amount: true },
    });

    return stats.map((stat) => ({
      channel: stat.paymentChannel || 'unknown',
      count: stat._count.id,
      totalAmount: stat._sum.amount,
    }));
  }
}
