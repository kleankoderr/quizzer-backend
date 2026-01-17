import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SummaryService } from './summary.service';
import { SummaryProcessor } from './summary.processor';
import { SummaryController } from './summary.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LangChainModule } from '../langchain/langchain.module';
import { AuthModule } from '../auth/auth.module';
import { StudyPackModule } from '../study-pack/study-pack.module';
import { SummaryGenerationStrategy } from './strategies/summary-generation.strategy';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'summary-generation',
    }),
    PrismaModule,
    LangChainModule,
    AuthModule,
    StudyPackModule,
  ],
  controllers: [SummaryController],
  providers: [SummaryService, SummaryProcessor, SummaryGenerationStrategy],
  exports: [SummaryService],
})
export class SummaryModule {}
