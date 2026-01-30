import { Processor } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../common/services/cache.service';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { BaseProcessor } from '../common/queue/base.processor';
import { ContentGenerationStrategy } from './strategies/content-generation.strategy';

export interface ContentJobData {
  userId: string;
  dto: {
    title?: string;
    topic?: string;
    content?: string;
    studyPackId?: string;
  };
  files?: Array<{
    originalname: string;
    cloudinaryUrl?: string;
    cloudinaryId?: string;
    googleFileUrl?: string;
    googleFileId?: string;
    documentId?: string;
    mimetype?: string;
    size?: number;
  }>;
}

@Injectable()
@Processor('content-generation')
export class ContentProcessor extends BaseProcessor<ContentJobData> {
  protected readonly logger = new Logger(ContentProcessor.name);

  constructor(
    eventEmitter: EventEmitter2,
    quotaService: QuotaService,
    studyPackService: StudyPackService,
    cacheService: CacheService,
    strategy: ContentGenerationStrategy
  ) {
    super(eventEmitter, quotaService, cacheService, studyPackService, strategy);
  }
}
