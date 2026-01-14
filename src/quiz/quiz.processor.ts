import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '../common/services/cache.service';
import { GenerateQuizDto } from './dto/quiz.dto';
import { QuotaService } from '../common/services/quota.service';
import { StudyPackService } from '../study-pack/study-pack.service';
import { BaseProcessor } from '../common/queue/base.processor';
import { QuizGenerationStrategy } from './strategies/quiz-generation.strategy';

export interface FileReference {
  originalname: string;
  cloudinaryUrl?: string;
  cloudinaryId?: string;
  googleFileUrl?: string;
  googleFileId?: string;
  mimetype?: string;
  documentId?: string;
}

export interface QuizJobData {
  userId: string;
  dto: GenerateQuizDto;
  contentId?: string;
  files?: FileReference[];
}

@Processor('quiz-generation')
export class QuizProcessor extends BaseProcessor<QuizJobData, any> {
  protected readonly logger = new Logger(QuizProcessor.name);

  constructor(
    eventEmitter: EventEmitter2,
    quotaService: QuotaService,
    studyPackService: StudyPackService,
    cacheService: CacheService,
    strategy: QuizGenerationStrategy
  ) {
    super(eventEmitter, quotaService, cacheService, studyPackService, strategy);
  }
}
