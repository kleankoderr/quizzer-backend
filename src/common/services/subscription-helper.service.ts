import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus, PlanType } from '@prisma/client';

@Injectable()
export class SubscriptionHelperService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if user has an active premium subscription
   * Single source of truth for premium status
   * A user is premium if they have:
   * 1. A Premium plan (not Free)
   * 2. ACTIVE subscription status
   * 3. currentPeriodEnd in the future
   */
  async isPremiumUser(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) return false;

    return (
      subscription.plan.name === PlanType.Premium &&
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date()
    );
  }

  /**
   * Get detailed premium status and plan information
   * Returns premium status, plan name, expiration date, and subscription status
   */
  async getPremiumStatus(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const isPremium =
      subscription?.plan.name === PlanType.Premium &&
      subscription?.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date();

    return {
      isPremium,
      planName: subscription?.plan.name || PlanType.Free,
      expiresAt: subscription?.currentPeriodEnd,
      status: subscription?.status || 'NONE',
    };
  }
}
