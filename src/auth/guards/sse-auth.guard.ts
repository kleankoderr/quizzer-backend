import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * SSE Auth Guard
 *
 * Authenticates SSE connections using Authorization header (Bearer token).
 * This is more secure than query parameters as tokens won't appear in logs or browser history.
 */
@Injectable()
export class SseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SseAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extract token from Authorization header (preferred)
    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else if (request.query.token) {
      // Fallback to query parameter (deprecated, for backward compatibility)
      token = request.query.token;
      this.logger.warn(
        'Token provided via query parameter. This is deprecated and will be removed. Use Authorization header instead.'
      );
    }

    if (!token) {
      throw new UnauthorizedException(
        'No authentication token provided. Use Authorization header with Bearer token.'
      );
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync(token, { secret });

      // Attach user info to request (similar to JwtStrategy)
      request.user = { sub: payload.sub, email: payload.email };

      return true;
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
