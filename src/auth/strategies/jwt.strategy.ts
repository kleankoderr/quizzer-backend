import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../../session/session.service';
import { OtpCacheService } from '../../otp/otp-cache.service';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly otpCacheService: OtpCacheService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Support query parameter for SSE connections (EventSource can't send headers)
        (request: Request) => {
          return (request?.query?.token as string) || undefined;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      passReqToCallback: true, // Pass request to validate method
    });
  }

  async validate(req: Request, payload: any) {
    // Extract token from Authorization header for session validation
    const token = req?.headers?.authorization?.replace('Bearer ', '');

    // Check if token is blacklisted
    if (token && (await this.sessionService.isTokenBlacklisted(token))) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or has been deleted');
    }

    // Check verification status
    let isVerified = await this.otpCacheService.getVerificationStatus(
      user.email
    );
    if (isVerified === null) {
      isVerified = user.emailVerified;
      // Cache it
      await this.otpCacheService.cacheVerificationStatus(
        user.email,
        isVerified
      );
    }

    if (!isVerified) {
      throw new UnauthorizedException(
        'Email address is not verified. Please verify your email.'
      );
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      sub: user.id,
      role: user.role,
    };
  }
}
