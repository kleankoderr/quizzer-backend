import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { GeminiAiService } from './gemini-ai.service';
import { GroqAiService } from './groq-ai.service';
import { SmartAiService } from './smart-ai.service';

@Module({
  imports: [ConfigModule],
  providers: [
    GeminiAiService,
    GroqAiService,
    SmartAiService,
    {
      provide: AiService,
      useExisting: SmartAiService,
    },
  ],
  exports: [AiService],
})
export class AiModule {}
