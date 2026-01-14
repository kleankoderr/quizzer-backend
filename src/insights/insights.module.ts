import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LangChainModule } from '../langchain/langchain.module';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';

@Module({
  imports: [PrismaModule, LangChainModule, AiModule, AssessmentModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
