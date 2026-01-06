import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../../prisma/prisma.service';

export interface PlanWithEntitlements {
  id: string;
  name: string;
  price: number;
  interval: string;
  isActive: boolean;
  quotas?: any;
  entitlements: Array<{
    id: string;
    planId: string;
    entitlementId: string;
    value: any;
    entitlement: {
      id: string;
      key: string;
      name: string;
      description?: string;
      type: string;
    };
  }>;
}

@Injectable()
export class EntitlementConfigProvider {
  private readonly logger = new Logger(EntitlementConfigProvider.name);

  // Cache TTLs in milliseconds
  private readonly PLAN_TTL = 3600000; // 1 hour
  private readonly USER_PLAN_TTL = 300000; // 5 minutes
  private readonly ENTITLEMENT_TTL = 86400000; // 1 day

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  /**
   * Get plan with all entitlements (cached)
   * Cache-first strategy for optimal performance
   * @param planId Plan ID
   * @returns Plan with entitlements
   */
  async getPlanWithEntitlements(
    planId: string
  ): Promise<PlanWithEntitlements | null> {
    const cacheKey = `plan:${planId}:entitlements`;
    const startTime = performance.now();

    try {
      // Try Redis first
      const cached =
        await this.cacheManager.get<PlanWithEntitlements>(cacheKey);

      if (cached) {
        const duration = performance.now() - startTime;
        this.logger.debug(
          `Cache HIT for plan ${planId} (${duration.toFixed(2)}ms)`
        );
        return cached;
      }

      // Cache miss - fetch from DB
      this.logger.debug(`Cache MISS for plan ${planId}, fetching from DB`);

      const plan = await this.prisma.subscriptionPlan.findUnique({
        where: { id: planId },
        include: {
          entitlements: {
            include: {
              entitlement: true,
            },
          },
        },
      });

      if (!plan) {
        this.logger.warn(`Plan ${planId} not found in database`);
        return null;
      }

      // Store in cache
      await this.cacheManager.set(cacheKey, plan, this.PLAN_TTL);

      const duration = performance.now() - startTime;
      this.logger.log(
        `Fetched and cached plan ${planId} (${duration.toFixed(2)}ms)`
      );

      return plan as unknown as PlanWithEntitlements;
    } catch (error) {
      this.logger.error(
        `Error getting plan ${planId} with entitlements`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Get user's active plan (cached)
   * @param userId User ID
   * @returns User's current active plan or null
   */
  async getUserActivePlan(
    userId: string
  ): Promise<PlanWithEntitlements | null> {
    const cacheKey = `user:${userId}:activeplan`;
    const startTime = performance.now();

    try {
      // Try cache first
      const cached =
        await this.cacheManager.get<PlanWithEntitlements>(cacheKey);

      if (cached) {
        const duration = performance.now() - startTime;
        this.logger.debug(
          `Cache HIT for user ${userId} active plan (${duration.toFixed(2)}ms)`
        );
        return cached;
      }

      // Cache miss - fetch subscription with plan
      this.logger.debug(
        `Cache MISS for user ${userId} active plan, fetching from DB`
      );

      const subscription = await this.prisma.subscription.findUnique({
        where: { userId },
        include: {
          plan: {
            include: {
              entitlements: {
                include: {
                  entitlement: true,
                },
              },
            },
          },
        },
      });

      const plan = subscription?.plan || null;

      // Cache even null results (prevents repeated DB queries for users without subscription)
      await this.cacheManager.set(cacheKey, plan, this.USER_PLAN_TTL);

      const duration = performance.now() - startTime;
      this.logger.log(
        `Fetched and cached user ${userId} active plan (${duration.toFixed(2)}ms)`
      );

      return plan as PlanWithEntitlements | null;
    } catch (error) {
      this.logger.error(
        `Error getting user ${userId} active plan`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Get single entitlement by ID (cached)
   * @param entitlementId Entitlement ID
   * @returns Entitlement or null
   */
  async getEntitlement(entitlementId: string) {
    const cacheKey = `entitlement:${entitlementId}`;

    try {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        return cached;
      }

      const entitlement = await this.prisma.entitlement.findUnique({
        where: { id: entitlementId },
      });

      if (entitlement) {
        await this.cacheManager.set(
          cacheKey,
          entitlement,
          this.ENTITLEMENT_TTL
        );
      }

      return entitlement;
    } catch (error) {
      this.logger.error(
        `Error getting entitlement ${entitlementId}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Invalidate plan cache
   * Call this when plan or its entitlements are updated
   * @param planId Plan ID
   */
  async invalidatePlan(planId: string): Promise<void> {
    const cacheKey = `plan:${planId}:entitlements`;

    try {
      await this.cacheManager.del(cacheKey);
      this.logger.log(`Invalidated cache for plan ${planId}`);
    } catch (error) {
      this.logger.error(`Error invalidating plan ${planId} cache`, error.stack);
    }
  }

  /**
   * Invalidate user's active plan cache
   * Call this when user's subscription changes
   * @param userId User ID
   */
  async invalidateUserPlan(userId: string): Promise<void> {
    const cacheKey = `user:${userId}:activeplan`;

    try {
      await this.cacheManager.del(cacheKey);
      this.logger.log(`Invalidated cache for user ${userId} active plan`);
    } catch (error) {
      this.logger.error(
        `Error invalidating user ${userId} plan cache`,
        error.stack
      );
      // Don't throw - cache invalidation failure shouldn't break the app
    }
  }

  /**
   * Invalidate entitlement cache
   * Call this when entitlement definition is updated
   * @param entitlementId Entitlement ID
   */
  async invalidateEntitlement(entitlementId: string): Promise<void> {
    const cacheKey = `entitlement:${entitlementId}`;

    try {
      await this.cacheManager.del(cacheKey);
      this.logger.log(`Invalidated cache for entitlement ${entitlementId}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating entitlement ${entitlementId} cache`,
        error.stack
      );
    }
  }
}
