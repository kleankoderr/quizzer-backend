import { Processor } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../common/services/cache.service';
import { GenerateFlashcardDto } from './dto/flashcard.dto';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { BaseProcessor } from '../common/queue/base.processor';
import { FlashcardGenerationStrategy } from './strategies/flashcard-generation.strategy';

export interface ProcessedFileData {
  originalname: string;
  cloudinaryUrl?: string;
  cloudinaryId?: string;
  googleFileUrl?: string;
  googleFileId?: string;
  mimetype?: string;
  documentId?: string;
  size?: number;
}

export interface FlashcardJobData {
  userId: string;
  dto: GenerateFlashcardDto;
  files?: ProcessedFileData[];
  chunkIndex?: number;
  existingFlashcardSetId?: string;
  totalCardsRequested?: number;
  cardsToGenerate?: number;
  contentHash?: string;
}

@Injectable()
@Processor('flashcard-generation', {
  concurrency: 2, // Process 2 flashcard chunks concurrently
})
export class FlashcardProcessor extends BaseProcessor<FlashcardJobData, any> {
  protected readonly logger = new Logger(FlashcardProcessor.name);

  constructor(
    eventEmitter: EventEmitter2,
    quotaService: QuotaService,
    studyPackService: StudyPackService,
    cacheService: CacheService,
    strategy: FlashcardGenerationStrategy
  ) {
    super(eventEmitter, quotaService, cacheService, studyPackService, strategy);
  }
}
