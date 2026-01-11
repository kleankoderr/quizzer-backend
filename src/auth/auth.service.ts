import { OAuth2Client } from 'google-auth-library';
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SignupDto, LoginDto, GoogleAuthDto } from './dto/auth.dto';
import { SettingsService } from '../settings/settings.service';
import { SessionService } from '../session/session.service';
import { SubscriptionHelperService } from '../common/services/subscription-helper.service';
import axios from 'axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OtpService } from '../otp/otp.service';
import { OtpCacheService } from '../otp/otp-cache.service';
import { OtpEmailEvent } from '../email/events/otp-email.event';
import { PasswordResetEvent } from '../email/events/password-reset.event';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly client: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly settingsService: SettingsService,
    private readonly sessionService: SessionService,
    private readonly subscriptionHelper: SubscriptionHelperService,
    private readonly eventEmitter: EventEmitter2,
    private readonly otpService: OtpService,
    private readonly otpCacheService: OtpCacheService
  ) {
    this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async signup(signupDto: SignupDto) {
    // Check if registration is allowed
    const settings = await this.settingsService.getPublicSettings();
    if (!settings.allowRegistration) {
      throw new ForbiddenException(
        'Registration is currently disabled. Please check back later or contact support.'
      );
    }

    const { email, password, name } = signupDto;

    // Check rate limit before proceeding
    const rateLimit =
      await this.otpCacheService.checkOtpGenerationRateLimit(email);
    if (!rateLimit.allowed) {
      throw new HttpException(
        `Too many OTP requests. Please try again in ${rateLimit.remaining} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        emailVerified: false,
        profile: {
          create: {
            name,
          },
        },
        preference: {
          create: {},
        },
      },
      include: {
        profile: true,
      },
    });

    // Generate OTP
    const otp = this.otpService.generateOtp();
    const hashedOtp = await this.otpService.hashOtp(otp);

    // Cache OTP (10 minutes)
    await this.otpCacheService.cacheOtp(email, hashedOtp, 600);

    // Emit event to send email
    this.eventEmitter.emit('otp.send', new OtpEmailEvent(email, name, otp));

    return {
      message:
        'Registration successful. Please check your email for the verification code.',
      email: user.email,
      requiresVerification: true,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user?.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password ?? '');

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Admins skip email verification
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (isAdmin) {
      return this.generateAuthResponse(user);
    }

    // Check verification status for non-admin users
    let isVerified = await this.otpCacheService.getVerificationStatus(email);
    if (isVerified === null) {
      // Fallback to DB
      isVerified = user.emailVerified;
      // Cache it
      await this.otpCacheService.cacheVerificationStatus(email, isVerified);
    }

    if (!isVerified) {
      return {
        message: 'Email verification required.',
        email: user.email,
        requiresVerification: true,
      };
    }

    return this.generateAuthResponse(user);
  }

  async verifyEmail(email: string, otp: string) {
    // 1. Check lockout
    if (await this.otpCacheService.isAccountLocked(email)) {
      throw new ForbiddenException(
        'Account is temporarily locked due to too many failed attempts. Please try again later.'
      );
    }

    // 2. Get cached OTP
    const cachedData = await this.otpCacheService.getCachedOtp(email);
    if (!cachedData) {
      throw new BadRequestException(
        'Invalid or expired OTP. Please request a new one.'
      );
    }

    // 3. Validate OTP
    const isValid = await this.otpService.validateOtp(
      otp,
      cachedData.hashedOtp
    );
    if (!isValid) {
      // Increment attempts
      const attempts =
        await this.otpCacheService.incrementFailedAttempts(email);
      if (attempts >= 5) {
        // 5 max attempts
        await this.otpCacheService.lockAccount(email, 900); // 15 mins lock
        throw new ForbiddenException(
          'Too many failed attempts. Account locked for 15 minutes.'
        );
      }
      throw new BadRequestException(
        `Invalid OTP. ${5 - attempts} attempts remaining.`
      );
    }

    // 4. Success
    // Update DB
    const user = await this.prisma.user.update({
      where: { email },
      data: { emailVerified: true },
      include: { profile: true },
    });

    // Clear cache
    await this.otpCacheService.deleteCachedOtp(email);
    // Cache verification status
    await this.otpCacheService.cacheVerificationStatus(email, true);

    // Auto-login (generate token)
    return this.generateAuthResponse(user);
  }

  async resendOtp(email: string) {
    // Check user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      throw new ConflictException('Email is already verified');
    }

    // Check lockout
    if (await this.otpCacheService.isAccountLocked(email)) {
      throw new ForbiddenException(
        'Account is temporarily locked due to too many failed attempts. Please try again later.'
      );
    }

    // Check resend limit
    const resendLimit =
      await this.otpCacheService.checkOtpResendRateLimit(email);
    if (!resendLimit.allowed) {
      throw new HttpException(
        `Please wait ${resendLimit.retryAfter} seconds before requesting a new OTP.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Check generation limit
    const genLimit =
      await this.otpCacheService.checkOtpGenerationRateLimit(email);
    if (!genLimit.allowed) {
      throw new HttpException(
        `Too many OTP requests. Try again later.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Generate & Send
    const otp = this.otpService.generateOtp();
    const hashedOtp = await this.otpService.hashOtp(otp);
    await this.otpCacheService.cacheOtp(email, hashedOtp, 600);
    this.eventEmitter.emit(
      'otp.send',
      new OtpEmailEvent(email, user.profile?.name, otp)
    );

    return { message: 'OTP sent successfully' };
  }

  async googleLogin(googleAuthDto: GoogleAuthDto) {
    const { idToken: token } = googleAuthDto;

    try {
      let email: string;
      let name: string;
      let picture: string;
      let uid: string;

      // Check if token is JWT (ID Token)
      if (token.split('.').length === 3) {
        const ticket = await this.client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        if (!payload) {
          throw new UnauthorizedException('Invalid Google token');
        }

        email = payload.email;
        name = payload.name;
        picture = payload.picture;
        uid = payload.sub;
      } else {
        // Assume Access Token - Fetch user info
        try {
          const userInfoResponse = await axios.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          const userInfo = userInfoResponse.data;
          email = userInfo.email;
          name = userInfo.name;
          picture = userInfo.picture;
          uid = userInfo.sub;
        } catch (_error) {
          throw new UnauthorizedException('Invalid Google access token');
        }
      }

      if (!email) {
        throw new UnauthorizedException('Email not found in Google token');
      }

      // Check if user exists
      let user = await this.prisma.user.findUnique({
        where: { email },
        include: { profile: true },
      });

      if (user) {
        // Update googleId if not set
        if (!user.googleId) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { googleId: uid },
            include: { profile: true },
          });
        }
      } else {
        // Check if registration is allowed
        const settings = await this.settingsService.getPublicSettings();
        if (!settings.allowRegistration) {
          throw new ForbiddenException(
            'Registration is currently disabled. Please check back later or contact support.'
          );
        }

        // Create new user
        user = await this.prisma.user.create({
          data: {
            email,
            googleId: uid,
            password: null, // No password for Google users
            emailVerified: true, // Google users are verified by default
            profile: {
              create: {
                name: name || email.split('@')[0],
                avatar: picture,
              },
            },
            preference: {
              create: {},
            },
          },
          include: {
            profile: true,
          },
        });
      }

      // Cache verification status for Google users
      await this.otpCacheService.cacheVerificationStatus(email, true);

      return this.generateAuthResponse(user);
    } catch (_error) {
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  private async generateAuthResponse(
    user: any,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Create session in Redis
    await this.sessionService.createSession({
      userId: user.id,
      email: user.email,
      token: accessToken,
      deviceInfo,
      ipAddress,
      userAgent,
    });

    // Get premium status from subscription (single source of truth)
    const isPremium = await this.subscriptionHelper.isPremiumUser(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.name,
        avatar: user.profile?.avatar,
        schoolName: user.profile?.schoolName,
        grade: user.profile?.grade,
        role: user.role,
        isPremium, // Replacing plan field with isPremium for backwards compatibility
        onboardingCompleted: user.profile?.onboardingCompleted,
        assessmentPopupShown: user.profile?.assessmentPopupShown,
        createdAt: user.createdAt,
      },
      accessToken,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) return null;

    // Get premium status from subscription (single source of truth)
    const isPremium = await this.subscriptionHelper.isPremiumUser(userId);

    return {
      ...user,
      name: user.profile?.name,
      avatar: user.profile?.avatar,
      schoolName: user.profile?.schoolName,
      grade: user.profile?.grade,
      onboardingCompleted: user.profile?.onboardingCompleted,
      assessmentPopupShown: user.profile?.assessmentPopupShown,
      isPremium, // Add isPremium based on subscription status
    };
  }

  /**
   * Blacklist a token (for logout)
   */
  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    await this.sessionService.blacklistToken(token, expiresIn);
  }

  /**
   * Calculate remaining lifetime of a JWT token
   * Returns remaining seconds until expiration
   */
  async calculateTokenRemainingTime(token: string): Promise<number> {
    try {
      // Decode JWT without verification to get expiration
      const decoded = this.jwtService.decode(token);

      if (!decoded?.exp) {
        return 0; // Invalid token, no need to blacklist
      }

      const now = Math.floor(Date.now() / 1000); // Current time in seconds
      const remainingTime = decoded.exp - now;

      return Math.max(remainingTime, 0);
    } catch (_error) {
      // If decoding fails, return 0 (don't blacklist)
      return 0;
    }
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user) {
      return {
        message:
          'If an account exists with this email, you will receive a reset code.',
      };
    }

    // Rate limit
    const genLimit =
      await this.otpCacheService.checkOtpGenerationRateLimit(email);
    if (!genLimit.allowed) {
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Generate & Send OTP (works for both regular users and Google OAuth users)
    const otp = this.otpService.generateOtp();
    const hashedOtp = await this.otpService.hashOtp(otp);
    await this.otpCacheService.cachePasswordResetOtp(email, hashedOtp, 600);

    // Send password reset email
    this.eventEmitter.emit(
      'password-reset.send',
      new PasswordResetEvent(email, user.profile?.name, otp)
    );

    return { message: 'Password reset code sent to your email.' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    // 1. Check cached OTP
    const cachedData =
      await this.otpCacheService.getCachedPasswordResetOtp(email);
    if (!cachedData) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    // 2. Validate OTP
    const isValid = await this.otpService.validateOtp(
      otp,
      cachedData.hashedOtp
    );
    if (!isValid) {
      const attempts =
        await this.otpCacheService.incrementPasswordResetFailedAttempts(email);
      if (attempts >= 5) {
        await this.otpCacheService.lockAccount(email, 900);
        throw new ForbiddenException(
          'Too many failed attempts. Account locked for 15 minutes.'
        );
      }
      throw new BadRequestException(
        `Invalid reset code. ${5 - attempts} attempts remaining.`
      );
    }

    // 3. Update Password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        emailVerified: true, // resetting password also confirms email ownership
      },
    });

    // 4. Clear cache
    await this.otpCacheService.deleteCachedPasswordResetOtp(email);

    return {
      message:
        'Password reset successful. You can now log in with your new password.',
    };
  }
}
