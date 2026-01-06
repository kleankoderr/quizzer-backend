import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionScheduler } from './subscription.scheduler';
import { PaystackService } from './paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { LockService } from '../common/services/lock.service';
import { CommonModule } from '../common/common.module';
import { UsageService } from './domain/services/usage.service';
import { EntitlementService } from './domain/services/entitlement.service';
import { PlanManagementService } from './domain/services/plan-management.service';
import { EntitlementConfigProvider } from './domain/services/entitlement-config.provider';
import { EntitlementEngine } from './domain/services/entitlement-engine.service';
import { PlanAdminController } from './plan-admin.controller';
import { EntitlementAdminController } from './entitlement-admin.controller';
import { EntitlementGuard } from './guards/entitlement.guard';

@Module({
  imports: [
    HttpModule,
    CommonModule,
    CacheModule.register({
      ttl: 3600000, // 1 hour in milliseconds
      max: 100, // Maximum number of items in cache
    }),
  ],
  controllers: [
    SubscriptionController,
    PlanAdminController,
    EntitlementAdminController,
  ],
  providers: [
    SubscriptionService,
    SubscriptionScheduler,
    PaystackService,
    PrismaService,
    LockService,
    UsageService,
    EntitlementService,
    PlanManagementService,
    EntitlementConfigProvider,
    EntitlementEngine,
    EntitlementGuard,
  ],
  exports: [
    PaystackService,
    SubscriptionService,
    UsageService,
    EntitlementService,
    PlanManagementService,
    EntitlementConfigProvider,
    EntitlementEngine,
    EntitlementGuard,
  ],
})
export class SubscriptionModule {}
