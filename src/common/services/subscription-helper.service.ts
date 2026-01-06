import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class SubscriptionHelperService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if user has an active paid subscription
   * A user is considered a 'paid' user if they have an active subscription
   * on a plan that is not the 'Free' tier.
   */
  async isPremiumUser(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) return false;

    return (
      subscription.plan.price > 0 &&
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date()
    );
  }

  /**
   * Get detailed status and plan information
   */
  async getPremiumStatus(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const isPaid =
      (subscription?.plan.price ?? 0) > 0 &&
      subscription?.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd > new Date();

    return {
      isPremium: isPaid,
      planName: subscription?.plan.name || 'Free',
      expiresAt: subscription?.currentPeriodEnd,
      status: subscription?.status || 'NONE',
    };
  }
}
