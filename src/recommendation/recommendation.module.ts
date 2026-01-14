import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { LangChainModule } from '../langchain/langchain.module';
import { AiModule } from '../ai/ai.module';
import { QuotaService } from '../common/services/quota.service';

@Module({
  imports: [LangChainModule, AiModule],
  controllers: [RecommendationController],
  providers: [RecommendationService, QuotaService],
  exports: [RecommendationService],
})
export class RecommendationModule {}
