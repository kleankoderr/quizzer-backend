import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AiModule } from './ai/ai.module';
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

import { SeedModule } from './seed/seed.module';
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
import { SettingsModule } from './settings/settings.module';
import { EventsModule } from './events/events.module';
import { UserDocumentModule } from './user-document/user-document.module';
import { StudyPackModule } from './study-pack/study-pack.module';
import { CommonModule } from './common/common.module';
import { SessionModule } from './session/session.module';
import { SubscriptionModule } from './subscription/subscription.module';

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
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: Number.parseInt(url.port),
            username: url?.username,
            password: url?.password,
          },

          // GLOBAL DEFAULT JOB OPTIONS FOR ALL QUEUES
          defaultJobOptions: {
            attempts: 1, // No retry (1 attempt = 0 retries)
            backoff: undefined, // Disable backoff
            ttl: 60_000, // Jobs expire after 60s
            removeOnComplete: { age: 60 }, // Keep completed jobs 60s
            removeOnFail: { age: 60 }, // Keep failed jobs for 60s (1 minute)
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
    AiModule,
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

    SeedModule,
    AdminModule,
    StudyModule,
    AssessmentModule,
    InsightsModule,
    CompanionModule,
    QuoteModule,
    SchoolModule,
    CoachingModule,
    SettingsModule,
    OnboardingModule,
    SearchModule,
    EventsModule,
    UserDocumentModule,
    StudyPackModule,
    CommonModule,
    SubscriptionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
