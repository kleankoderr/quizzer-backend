import { Module, Global } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true, // Wildcard support for listeners (e.g. 'flashcard.*')
      delimiter: ".", // Delimiter for namespaced events
      ignoreErrors: false, // Output error if listener fails
    }),
  ],
  exports: [EventEmitterModule],
})
export class EventsModule {}
