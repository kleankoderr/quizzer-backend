import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionScheduler } from './subscription.scheduler';
import { PaystackService } from './paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [HttpModule, CommonModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    SubscriptionScheduler,
    PaystackService,
    PrismaService,
  ],
  exports: [PaystackService, SubscriptionService],
})
export class SubscriptionModule {}
