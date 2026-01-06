import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntitlementConfigProvider } from './entitlement-config.provider';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class PlanManagementService {
  private readonly logger = new Logger(PlanManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementConfigProvider: EntitlementConfigProvider
  ) {}

  async getAllPlans() {
    return this.prisma.subscriptionPlan.findMany({
      include: {
        entitlements: {
          include: {
            entitlement: true,
          },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: { price: 'asc' },
    });
  }

  async getPlanById(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        entitlements: {
          include: {
            entitlement: true,
          },
        },
      },
    });
    if (!plan) throw new NotFoundException(`Plan with ID ${id} not found`);
    return plan;
  }

  async createPlan(dto: {
    name: string;
    description?: string;
    price: number;
    interval: string;
    isActive?: boolean;
    entitlements?: { entitlementId: string; value: any }[];
  }) {
    const { entitlements, ...planData } = dto;

    return this.prisma.subscriptionPlan.create({
      data: {
        ...planData,
        isActive: planData.isActive !== false,
        entitlements: entitlements
          ? {
              create: entitlements.map((e) => ({
                entitlementId: e.entitlementId,
                value: e.value,
              })),
            }
          : undefined,
      },
      include: {
        entitlements: true,
      },
    });
  }

  async updatePlan(id: string, dto: any) {
    const { entitlements, ...planData } = dto;

    // If entitlements are provided, we might want to sync them (delete old, create new)
    // For now, let's just update the basic plan data
    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...planData,
        entitlements: entitlements
          ? {
              deleteMany: {},
              create: entitlements.map((e) => ({
                entitlementId: e.entitlementId,
                value: e.value,
              })),
            }
          : undefined,
      },
      include: {
        entitlements: true,
      },
    });

    // Invalidate cache after update
    await this.entitlementConfigProvider.invalidatePlan(id);
    this.logger.log(`Plan ${id} updated and cache invalidated`);

    return updated;
  }

  async deletePlan(id: string) {
    // Check if plan has active users
    const usageCount = await this.prisma.subscription.count({
      where: { planId: id, status: 'ACTIVE' },
    });

    let result: SubscriptionPlan;
    if (usageCount > 0) {
      // Soft delete: deactivate
      result = await this.prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      result = await this.prisma.subscriptionPlan.delete({
        where: { id },
      });
    }

    // Invalidate cache after deletion/deactivation
    await this.entitlementConfigProvider.invalidatePlan(id);
    this.logger.log(`Plan ${id} deleted/deactivated and cache invalidated`);

    return result;
  }
}
