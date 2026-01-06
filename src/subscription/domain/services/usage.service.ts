import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(userId: string, featureKey: string): Promise<number> {
    const record = await this.prisma.usageRecord.findUnique({
      where: { userId_featureKey: { userId, featureKey } },
    });
    return record?.currentValue ?? 0;
  }

  async incrementUsage(
    userId: string,
    featureKey: string,
    amount: number = 1
  ): Promise<number> {
    const record = await this.prisma.usageRecord.upsert({
      where: { userId_featureKey: { userId, featureKey } },
      create: {
        userId,
        featureKey,
        currentValue: amount,
        resetAt: this.getNextMonthlyResetDate(),
      },
      update: {
        currentValue: { increment: amount },
      },
    });
    return record.currentValue;
  }

  async resetUsage(userId: string, featureKey: string): Promise<void> {
    await this.prisma.usageRecord.update({
      where: { userId_featureKey: { userId, featureKey } },
      data: { currentValue: 0, resetAt: this.getNextMonthlyResetDate() },
    });
  }

  /**
   * Get usage count within a time window for frequency-based policies
   * @param userId User ID
   * @param featureKey Feature key
   * @param windowStart Start of time window
   * @returns Number of usages in the time window
   */
  async getUsageInWindow(
    userId: string,
    featureKey: string,
    windowStart: Date
  ): Promise<number> {
    // Count usage records created within the window
    const count = await this.prisma.usageRecord.count({
      where: {
        userId,
        featureKey,
        createdAt: {
          gte: windowStart,
        },
      },
    });
    return count;
  }

  async decrementUsage(
    userId: string,
    featureKey: string,
    amount: number
  ): Promise<number> {
    const record = await this.prisma.usageRecord.update({
      where: { userId_featureKey: { userId, featureKey } },
      data: {
        currentValue: { decrement: amount },
      },
    });
    return record.currentValue;
  }

  private getNextMonthlyResetDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date;
  }
}
