import {
  Injectable,
  Logger,
  OnModuleDestroy,
  MessageEvent,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, Observable, filter, map, tap, finalize } from 'rxjs';
import { AppEvent } from '../events/events.types';

export interface SseEventData {
  eventType: string;
  payload: any;
  timestamp: number;
}

const SSE_RETRY_MS = 3000;
const SSE_MESSAGE_TYPE = 'message';

@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);
  private readonly eventSubject = new Subject<AppEvent>();
  private readonly activeSubscriptions = new Set<string>();

  constructor() {
    this.logger.log('SSE Service initialized');
  }

  onModuleDestroy() {
    this.logger.log(
      `SSE Service shutting down. Active subscriptions: ${this.activeSubscriptions.size}`
    );
    this.eventSubject.complete();
    this.activeSubscriptions.clear();
  }

  /**
   * Subscribe a user to their specific SSE event stream
   * Returns an Observable that filters events by userId and formats them for SSE
   */
  subscribe(userId: string): Observable<MessageEvent> {
    this.activeSubscriptions.add(userId);
    this.logger.log(
      `User ${userId} subscribed (Total active: ${this.activeSubscriptions.size})`
    );

    return this.eventSubject.asObservable().pipe(
      // Filter events for this specific user
      filter((event) => this.isEventForUser(event, userId)),
      // Transform to SSE format
      map((event) => this.formatSseMessage(event)),
      // Log debug info
      tap((message) => this.logEventForwarding(userId, message)),
      // Clean up on unsubscribe/complete/error
      finalize(() => this.handleUnsubscribe(userId))
    );
  }

  /**
   * Listen to all application events and forward to appropriate streams
   * Using wildcard listener to catch all events
   */
  @OnEvent('**')
  handleEvent(payload: AppEvent) {
    if (this.isValidAppEvent(payload)) {
      this.logger.debug(
        `Broadcasting event: ${payload.eventType || 'unknown'} for user ${payload.userId}`
      );
      this.eventSubject.next(payload);
    }
  }

  /**
   * Manually emit an event to a specific user
   * Useful for direct messaging or custom notifications
   */
  emitToUser(userId: string, eventType: string, data: any): void {
    const event: AppEvent = {
      userId,
      eventType,
      ...data,
      timestamp: Date.now(),
    };

    this.logger.debug(`Direct emit to user ${userId}: ${eventType}`);
    this.eventSubject.next(event);
  }

  /**
   * Broadcast a message to multiple users
   */
  emitToUsers(userIds: string[], eventType: string, data: any): void {
    this.logger.debug(
      `Broadcasting to ${userIds.length} user(s): ${eventType}`
    );

    for (const userId of userIds) {
      this.emitToUser(userId, eventType, data);
    }
  }

  /**
   * Get the count of active subscriptions
   */
  getActiveSubscriptionCount(): number {
    return this.activeSubscriptions.size;
  }

  /**
   * Validate if the event is intended for a specific user
   */
  private isEventForUser(event: AppEvent, userId: string): boolean {
    return event?.userId === userId;
  }

  /**
   * Validate if the payload is a valid AppEvent
   */
  private isValidAppEvent(payload: any): payload is AppEvent {
    return (
      payload &&
      typeof payload === 'object' &&
      typeof payload.userId === 'string' &&
      payload.userId.length > 0
    );
  }

  /**
   * Format an AppEvent into SSE MessageEvent format
   * Sends the event with all properties at root level for simpler frontend parsing
   */
  private formatSseMessage(event: AppEvent): MessageEvent {
    return {
      data: this.sanitizeEventPayload(event),
      id: this.generateEventId(),
      type: SSE_MESSAGE_TYPE,
      retry: SSE_RETRY_MS,
    };
  }

  /**
   * Remove internal fields from event before sending
   * Keeps all other properties at root level for easy access
   */
  private sanitizeEventPayload(event: AppEvent): any {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, ...sanitizedEvent } = event;
    return sanitizedEvent;
  }

  /**
   * Generate a unique event ID for SSE
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Log event forwarding for debugging
   */
  private logEventForwarding(userId: string, message: MessageEvent): void {
    const eventData = message.data as SseEventData;
    this.logger.debug(
      `Forwarding to user ${userId}: ${eventData.eventType} [ID: ${message.id}]`
    );
  }

  /**
   * Handle user unsubscription cleanup
   */
  private handleUnsubscribe(userId: string): void {
    this.activeSubscriptions.delete(userId);
    this.logger.log(
      `User ${userId} unsubscribed (Remaining: ${this.activeSubscriptions.size})`
    );
  }
}
