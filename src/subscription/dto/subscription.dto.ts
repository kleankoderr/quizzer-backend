import { IsString, IsNotEmpty, IsUrl, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';

/**
 * DTO for initiating subscription checkout
 */
export class CheckoutDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Subscription plan ID',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({
    example: 'https://yourdomain.com/subscription/verify',
    description: 'Frontend callback URL for payment redirect',
  })
  @IsUrl({ require_tld: false }) // Allow localhost URLs for development
  @IsNotEmpty()
  callbackUrl: string;
}

/**
 * DTO for scheduling a subscription downgrade
 */
export class ScheduleDowngradeDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'New subscription plan ID',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;
}

/**
 * DTO for checkout response
 */

/**
 * DTO for checkout response
 */
export class CheckoutResponseDto {
  @ApiProperty({
    example: 'https://checkout.paystack.com/abc123',
    description: 'Paystack authorization URL for payment',
  })
  authorizationUrl: string;

  @ApiProperty({
    example: 'ref_abc123xyz',
    description: 'Payment reference for tracking',
  })
  reference: string;

  @ApiProperty({
    example: 'Checkout initialized successfully',
    description: 'Success message',
  })
  message: string;
}

/**
 * DTO for subscription plan details
 */
export class PlanDetailsDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Plan ID',
  })
  id: string;

  @ApiProperty({
    example: 'Premium Monthly',
    description: 'Plan name',
  })
  name: string;

  @ApiProperty({
    example: 2000,
    description: 'Plan price in Naira (NGN)',
  })
  price: number;

  @ApiProperty({
    example: 'monthly',
    description: 'Billing interval',
  })
  interval: string;

  @ApiProperty({
    example: {
      quizzes: 15,
      flashcards: 15,
      studyMaterials: 10,
      conceptExplanations: 20,
      smartRecommendations: 20,
      smartCompanions: 20,
      filesPerMonth: 100,
      storageLimitMB: 1000,
    },
    description: 'Quota limits for this plan',
  })
  quotas: Record<string, any>;

  @ApiProperty({
    example: true,
    description: 'Whether the plan is active',
  })
  isActive: boolean;
}

/**
 * DTO for subscription response
 */
export class SubscriptionResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Subscription ID',
  })
  id: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'User ID',
  })
  userId: string;

  @ApiProperty({
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
    description: 'Subscription status',
  })
  status: SubscriptionStatus;

  @ApiProperty({
    example: '2025-01-17T20:00:00.000Z',
    description: 'Current period end date',
  })
  currentPeriodEnd: Date;

  @ApiProperty({
    example: false,
    description: 'Whether subscription will be cancelled at period end',
  })
  cancelAtPeriodEnd: boolean;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description:
      'ID of the plan scheduled to start at the end of the current period',
    required: false,
  })
  pendingPlanId?: string;

  @ApiProperty({
    type: PlanDetailsDto,
    description: 'Subscription plan details',
  })
  plan: PlanDetailsDto;

  @ApiProperty({
    example: '2024-12-17T20:00:00.000Z',
    description: 'Subscription creation date',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-12-17T20:00:00.000Z',
    description: 'Subscription last update date',
  })
  updatedAt: Date;
}

/**
 * Type for Paystack webhook event data
 */
export interface WebhookEventData {
  id?: number; // Paystack event ID for deduplication
  reference?: string;
  amount?: number;
  status?: string;
  created_at?: string; // Event timestamp for age validation
  customer?: {
    email?: string;
  };
  [key: string]: any;
}

/**
 * DTO for Paystack webhook event
 */
export class WebhookEventDto {
  @ApiProperty({
    example: 'charge.success',
    description: 'Webhook event type',
  })
  @IsString()
  @IsNotEmpty()
  event: string;

  @ApiProperty({
    description: 'Event data containing payment details',
  })
  @IsObject()
  @IsNotEmpty()
  data: WebhookEventData;
}

/**
 * DTO for subscription cancellation response
 */
export class CancelSubscriptionResponseDto {
  @ApiProperty({ example: 'Subscription cancelled successfully' })
  message: string;

  @ApiProperty({ type: SubscriptionResponseDto })
  subscription: SubscriptionResponseDto;
}

/**
 * DTO for verifying payment
 */
export class VerifyPaymentDto {
  @ApiProperty({
    example: 'ref_abc123xyz',
    description: 'Payment reference to verify',
  })
  @IsString()
  @IsNotEmpty()
  reference: string;
}

/**
 * DTO for quota usage information
 */
export class QuotaUsageDto {
  @ApiProperty({ example: 1 })
  used: number;

  @ApiProperty({ example: 2 })
  limit: number;

  @ApiProperty({ example: 1 })
  remaining: number;
}

/**
 * DTO for file upload quota information
 */
export class FileUploadQuotaDto {
  @ApiProperty({ example: 0 })
  dailyUsed: number;

  @ApiProperty({ example: 5 })
  dailyLimit: number;

  @ApiProperty({ example: 5 })
  dailyRemaining: number;

  @ApiProperty({ example: 0 })
  monthlyUsed: number;

  @ApiProperty({ example: 5 })
  monthlyLimit: number;

  @ApiProperty({ example: 5 })
  monthlyRemaining: number;
}

/**
 * DTO for file storage quota information
 */
export class FileStorageQuotaDto {
  @ApiProperty({ example: 16 })
  used: number;

  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 34 })
  remaining: number;
}

/**
 * DTO for current plan response with all quota information
 */
export class CurrentPlanResponseDto {
  @ApiProperty({ example: 'Free Plan' })
  planName: string;

  @ApiProperty({ example: 0 })
  price: number;

  @ApiProperty({ example: 'monthly' })
  interval: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: '2025-12-18T09:00:00.000Z' })
  currentPeriodEnd: Date;

  @ApiProperty({ example: false })
  cancelAtPeriodEnd: boolean;

  @ApiProperty({ example: false })
  hasActivePaidPlan: boolean;

  @ApiProperty({ type: QuotaUsageDto })
  quiz: QuotaUsageDto;

  @ApiProperty({ type: QuotaUsageDto })
  flashcard: QuotaUsageDto;

  @ApiProperty({ type: QuotaUsageDto })
  studyMaterial: QuotaUsageDto;

  @ApiProperty({ type: QuotaUsageDto })
  conceptExplanation: QuotaUsageDto;

  @ApiProperty({ type: QuotaUsageDto })
  smartRecommendation: QuotaUsageDto;

  @ApiProperty({ type: QuotaUsageDto })
  smartCompanion: QuotaUsageDto;

  @ApiProperty({ type: QuotaUsageDto })
  fileUpload: QuotaUsageDto;

  @ApiProperty({ type: FileStorageQuotaDto })
  fileStorage: FileStorageQuotaDto;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  monthlyResetAt: Date;
}
