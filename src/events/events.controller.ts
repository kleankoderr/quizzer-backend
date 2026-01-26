import {
  Controller,
  Sse,
  UseGuards,
  Req,
  MessageEvent,
  Post,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Observable,
  map,
  filter,
  fromEvent,
  timeout,
  catchError,
  throwError,
} from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppEvent } from './events.types';
import { SseAuthService } from './sse-auth.service';
import { SseAuthGuard } from './sse-auth.guard';

@Controller('events')
export class EventsController {
  private readonly SSE_TIMEOUT_MS = 60_000; // 60 seconds

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly sseAuthService: SseAuthService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('token')
  async getToken(@Req() req: any) {
    const token = await this.sseAuthService.generateToken(req.user.id);
    return { token };
  }

  @UseGuards(SseAuthGuard)
  @Sse('sse')
  from(@Req() req: any): Observable<MessageEvent> {
    const userId = req.user.id;

    return fromEvent<AppEvent>(this.eventEmitter, '**').pipe(
      filter((event: AppEvent) => event?.userId === userId),
      map((event: AppEvent) => ({
        data: event,
        type: event.eventType,
      })),
      timeout(this.SSE_TIMEOUT_MS),
      catchError((err) => {
        if (err.name === 'TimeoutError') {
          // Send timeout event before closing
          return throwError(
            () => new Error('SSE connection timed out after 60 seconds')
          );
        }
        return throwError(() => err);
      })
    );
  }
}
