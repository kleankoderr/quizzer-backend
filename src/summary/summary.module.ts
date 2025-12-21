import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SummaryService } from './summary.service';
import { SummaryProcessor } from './summary.processor';
import { SummaryController } from './summary.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'summary-generation',
    }),
    PrismaModule,
    AiModule,
    AuthModule,
  ],
  controllers: [SummaryController],
  providers: [SummaryService, SummaryProcessor],
  exports: [SummaryService],
})
export class SummaryModule {}
