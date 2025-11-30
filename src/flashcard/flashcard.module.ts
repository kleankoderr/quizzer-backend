import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { HttpModule } from "@nestjs/axios";
import { FlashcardController } from "./flashcard.controller";
import { FlashcardService } from "./flashcard.service";
import { FlashcardProcessor } from "./flashcard.processor";
import { AiModule } from "../ai/ai.module";
import { RecommendationModule } from "../recommendation/recommendation.module";
import { StreakModule } from "../streak/streak.module";
import { ChallengeModule } from "../challenge/challenge.module";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "flashcard-generation",
    }),
    HttpModule,
    AiModule,
    RecommendationModule,
    StreakModule,
    ChallengeModule,
  ],
  controllers: [FlashcardController],
  providers: [FlashcardService, FlashcardProcessor],
  exports: [FlashcardService],
})
export class FlashcardModule {}
