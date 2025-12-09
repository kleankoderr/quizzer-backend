import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

/**
 * SSE Auth Guard
 *
 * This guard is specifically for SSE endpoints where EventSource
 * doesn't support custom headers. It extracts the JWT token from
 * the query parameter instead of the Authorization header.
 */
@Injectable()
export class SseAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.query.token;

    if (!token) {
      throw new UnauthorizedException("No authentication token provided");
    }

    try {
      const secret = this.configService.get<string>("JWT_SECRET");
      const payload = await this.jwtService.verifyAsync(token, { secret });

      // Attach user info to request (similar to JwtStrategy)
      request.user = { sub: payload.sub, email: payload.email };

      return true;
    } catch (error) {
      throw new UnauthorizedException("Invalid authentication token");
    }
  }
}
