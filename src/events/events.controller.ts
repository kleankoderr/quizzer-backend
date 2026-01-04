import { Controller, Sse, UseGuards, Req, MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent, map, filter } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppEvent } from './events.types';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
  };
}

@Controller('events')
export class EventsController {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  @UseGuards(JwtAuthGuard)
  @Sse('sse')
  streamEvents(@Req() req: AuthenticatedRequest): Observable<MessageEvent> {
    const userId = req.user.id;

    return fromEvent<AppEvent>(this.eventEmitter, '**').pipe(
      filter((event: AppEvent) => event?.userId === userId),
      map((event: AppEvent) => ({
        data: event,
        type: event.eventType,
      }))
    );
  }
}
