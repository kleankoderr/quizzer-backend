import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QuotaService } from '../common/services/quota.service';
import { CacheService } from '../common/services/cache.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { BaseProcessor } from '../common/queue/base.processor';
import { SummaryGenerationStrategy } from './strategies/summary-generation.strategy';

export interface SummaryJobData {
  studyMaterialId: string;
  userId: string;
}

@Processor('summary-generation')
export class SummaryProcessor extends BaseProcessor<SummaryJobData, any> {
  protected readonly logger = new Logger(SummaryProcessor.name);

  constructor(
    eventEmitter: EventEmitter2,
    quotaService: QuotaService,
    studyPackService: StudyPackService,
    cacheService: CacheService,
    strategy: SummaryGenerationStrategy
  ) {
    super(eventEmitter, quotaService, cacheService, studyPackService, strategy);
  }
}
