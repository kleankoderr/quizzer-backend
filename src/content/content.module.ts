import { Module } from "@nestjs/common";
import { ContentService } from "./content.service";
import { ContentController } from "./content.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { TaskModule } from "../task/task.module";
import { NotificationModule } from "../notification/notification.module";
import { QuizModule } from "../quiz/quiz.module";
import { FlashcardModule } from "../flashcard/flashcard.module";

@Module({
  imports: [
    PrismaModule,
    AiModule,
    TaskModule,
    NotificationModule,
    QuizModule,
    FlashcardModule,
  ],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
