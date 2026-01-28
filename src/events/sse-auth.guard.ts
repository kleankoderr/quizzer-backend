import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SseAuthService } from './sse-auth.service';

@Injectable()
export class SseAuthGuard implements CanActivate {
  constructor(private readonly sseAuthService: SseAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const queryToken = request.query.token as string;
    const headerToken = request.headers['x-sse-token'] as string;
    const token = queryToken || headerToken;

    if (!token) {
      console.warn(
        `[SseAuthGuard] SSE token is missing. URL: ${request.url}, Query Keys: ${Object.keys(request.query)}`
      );
      throw new UnauthorizedException('SSE token is missing');
    }

    const userId = await this.sseAuthService.validateToken(token);

    if (!userId) {
      console.warn(
        `[SseAuthGuard] Invalid or expired SSE token: ${token.substring(0, 8)}...`
      );
      throw new UnauthorizedException('Invalid or expired SSE token');
    }

    // Attach user id to request for the controller to use
    request.user = { id: userId };

    return true;
  }
}
