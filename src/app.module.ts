import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AuthModule } from './auth/auth.module';
import { QuizModule } from './quiz/quiz.module';
import { FlashcardModule } from './flashcard/flashcard.module';
import { StreakModule } from './streak/streak.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { ChallengeModule } from './challenge/challenge.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { AttemptModule } from './attempt/attempt.module';
import { ContentModule } from './content/content.module';
import { StatisticsModule } from './statistics/statistics.module';
import { UserModule } from './user/user.module';
import { TaskModule } from './task/task.module';

import { AdminModule } from './admin/admin.module';
import { FileStorageModule } from './file-storage/file-storage.module';
import { StudyModule } from './study/study.module';
import { AssessmentModule } from './assessment/assessment.module';
import { InsightsModule } from './insights/insights.module';
import { CompanionModule } from './companion/companion.module';
import { QuoteModule } from './quote/quote.module';
import { SearchModule } from './search/search.module';
import { SchoolModule } from './school/school.module';
import { CoachingModule } from './coaching/coaching.module';
import { EventsModule } from './events/events.module';
import { UserDocumentModule } from './user-document/user-document.module';
import { StudyPackModule } from './study-pack/study-pack.module';
import { CommonModule } from './common/common.module';
import { SessionModule } from './session/session.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { WeakAreaModule } from './weak-area/weak-area.module';
import { SummaryModule } from './summary/summary.module';
import { EmailModule } from './email/email.module';
import { OtpModule } from './otp/otp.module';
import { LangChainModule } from './langchain/langchain.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://localhost:6379'
        );

        // BullMQ/ioredis works best with the URI string directly or with these specific options
        return {
          connection: {
            url: redisUrl,
            maxRetriesPerRequest: null, // REQUIRED for BullMQ workers
            enableReadyCheck: false,
          },

          // GLOBAL DEFAULT JOB OPTIONS FOR ALL QUEUES
          defaultJobOptions: {
            attempts: 3, // Increased from 1 to 3 for better reliability
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            timeout: 60_000, // Job timeout: 60 seconds
            removeOnComplete: { age: 3600 }, // Keep completed jobs for 1 hour
            removeOnFail: { age: 86400 }, // Keep failed jobs for 24 hours
          },
        };
      },
      inject: [ConfigService],
    }),

    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 10,
      },
    ]),
    PrismaModule,
    FileStorageModule,
    CacheModule,
    SessionModule,
    LangChainModule,
    RagModule,
    AuthModule,
    QuizModule,
    FlashcardModule,
    StreakModule,
    LeaderboardModule,
    ChallengeModule,
    RecommendationModule,
    AttemptModule,
    ContentModule,
    StatisticsModule,
    UserModule,
    TaskModule,

    AdminModule,
    StudyModule,
    AssessmentModule,
    InsightsModule,
    CompanionModule,
    QuoteModule,
    SchoolModule,
    CoachingModule,
    OnboardingModule,
    SearchModule,
    EventsModule,
    UserDocumentModule,
    StudyPackModule,
    CommonModule,
    SubscriptionModule,
    WeakAreaModule,
    SummaryModule,
    EmailModule,
    OtpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
