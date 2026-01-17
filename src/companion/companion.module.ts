import { Module } from '@nestjs/common';
import { CompanionController } from './companion.controller';
import { CompanionService } from './companion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LangChainModule } from '../langchain/langchain.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { InsightsModule } from '../insights/insights.module';

@Module({
  imports: [PrismaModule, LangChainModule, AssessmentModule, InsightsModule],
  controllers: [CompanionController],
  providers: [CompanionService],
  exports: [CompanionService],
})
export class CompanionModule {}
