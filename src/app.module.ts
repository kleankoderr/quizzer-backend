import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { CacheModule } from "./cache/cache.module";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { QuizModule } from "./quiz/quiz.module";
import { FlashcardModule } from "./flashcard/flashcard.module";
import { StreakModule } from "./streak/streak.module";
import { LeaderboardModule } from "./leaderboard/leaderboard.module";
import { ChallengeModule } from "./challenge/challenge.module";
import { RecommendationModule } from "./recommendation/recommendation.module";
import { AttemptModule } from "./attempt/attempt.module";
import { ContentModule } from "./content/content.module";
import { StatisticsModule } from "./statistics/statistics.module";
import { UserModule } from "./user/user.module";
import { TaskModule } from "./task/task.module";
import { NotificationModule } from "./notification/notification.module";
import { SeedModule } from "./seed/seed.module";
import { AdminModule } from "./admin/admin.module";
import { FileStorageModule } from "./file-storage/file-storage.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get("REDIS_HOST", "localhost"),
          port: configService.get("REDIS_PORT", 6379),
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        pinoHttp: {
          serializers: {
            req: (req) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              query: req.query,
              params: req.params,
            }),
          },
          customProps: (req: any, res) => ({
            payload: req.body,
          }),
          transport:
            configService.get("NODE_ENV") !== "production"
              ? {
                  target: "pino-pretty",
                  options: {
                    singleLine: true,
                  },
                }
              : undefined,
          redact: {
            paths: [
              "payload.password",
              "payload.token",
              "payload.creditCard",
              "payload.cvv",
              "payload.payment",
            ],
            remove: true,
          },
        },
      }),
    }),
    PrismaModule,
    FileStorageModule,
    CacheModule,
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
    NotificationModule,
    SeedModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: "APP_GUARD",
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
