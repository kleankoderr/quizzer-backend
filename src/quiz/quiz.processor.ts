import { Processor } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
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
  size?: number;
}

export interface QuizJobData {
  userId: string;
  dto: GenerateQuizDto;
  contentId?: string;
  files?: FileReference[];
  adminContext?: {
    scope: 'GLOBAL' | 'SCHOOL';
    schoolId?: string;
    isActive?: boolean;
    publishedAt?: Date;
  };
  chunkIndex?: number;
  existingQuizId?: string;
  totalQuestionsRequested?: number;
  questionsToGenerate?: number;
  contentHash?: string;
}

@Injectable()
@Processor('quiz-generation', {
  concurrency: 2, // Process 2 quiz chunks concurrently
})
export class QuizProcessor extends BaseProcessor<QuizJobData> {
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
