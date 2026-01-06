import { Module } from '@nestjs/common';
import { WeakAreaController } from './weak-area.controller';
import { WeakAreaService } from './weak-area.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, AiModule, SubscriptionModule],
  controllers: [WeakAreaController],
  providers: [WeakAreaService],
  exports: [WeakAreaService],
})
export class WeakAreaModule {}
