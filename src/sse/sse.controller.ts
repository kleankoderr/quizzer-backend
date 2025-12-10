import {
  Controller,
  Sse,
  UseGuards,
  Logger,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SseService } from './sse.service';
import { SseAuthGuard } from '../auth/guards/sse-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Server-Sent Events')
@Controller('sse')
@UseGuards(SseAuthGuard)
@ApiBearerAuth()
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(private readonly sseService: SseService) {}

  /**
   * Subscribe to real-time event stream for the authenticated user
   *
   * Authentication: Use Authorization header with Bearer token
   * Example: Authorization: Bearer <your-jwt-token>
   *
   * @returns Observable stream of MessageEvent objects
   */
  @Sse('stream')
  @ApiOperation({
    summary: 'Subscribe to real-time event stream',
    description:
      'Establishes a Server-Sent Events (SSE) connection to receive real-time updates. ' +
      'Requires Authorization header with Bearer token.',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  stream(@CurrentUser('sub') userId: string): Observable<MessageEvent> {
    this.logger.log(`Establishing SSE stream for user: ${userId}`);
    return this.sseService.subscribe(userId);
  }
}
