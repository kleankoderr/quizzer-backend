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
    const token = request.query.token as string;

    if (!token) {
      throw new UnauthorizedException('SSE token is missing');
    }

    const userId = await this.sseAuthService.validateToken(token);

    if (!userId) {
      throw new UnauthorizedException('Invalid or expired SSE token');
    }

    // Attach user id to request for the controller to use
    request.user = { id: userId };

    return true;
  }
}
