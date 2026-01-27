import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { EventsController } from './events.controller';
import { SseAuthService } from './sse-auth.service';
import { SseAuthGuard } from './sse-auth.guard';

@Global()
@Module({
  controllers: [EventsController],
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true, // Wildcard support for listeners (e.g. 'flashcard.*')
      delimiter: '.', // Delimiter for namespaced events
      ignoreErrors: false, // Output error if listener fails
    }),
  ],
  providers: [SseAuthService, SseAuthGuard],
  exports: [EventEmitterModule, SseAuthService],
})
export class EventsModule {}
