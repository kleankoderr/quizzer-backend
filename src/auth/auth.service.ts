import { OAuth2Client } from 'google-auth-library';
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SignupDto, LoginDto, GoogleAuthDto } from './dto/auth.dto';
import { SettingsService } from '../settings/settings.service';
import { SessionService } from '../session/session.service';
import { SubscriptionHelperService } from '../common/services/subscription-helper.service';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly client: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly settingsService: SettingsService,
    private readonly sessionService: SessionService,
    private readonly subscriptionHelper: SubscriptionHelperService
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
        name,
      },
    });

    return this.generateAuthResponse(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user?.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password ?? '');

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateAuthResponse(user);
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
      });

      if (user) {
        // Update googleId if not set
        if (!user.googleId) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { googleId: uid },
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
            name: name || email.split('@')[0],
            googleId: uid,
            avatar: picture,
            password: null, // No password for Google users
          },
        });
      }

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
        name: user.name,
        avatar: user.avatar,
        schoolName: user.schoolName,
        grade: user.grade,
        role: user.role,
        isPremium, // Replacing plan field with isPremium for backwards compatibility
        onboardingCompleted: user.onboardingCompleted,
        assessmentPopupShown: user.assessmentPopupShown,
        createdAt: user.createdAt,
      },
      accessToken,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        schoolName: true,
        grade: true,
        role: true,
        onboardingCompleted: true,
        assessmentPopupShown: true,
        createdAt: true,
      },
    });

    if (!user) return null;

    // Get premium status from subscription (single source of truth)
    const isPremium = await this.subscriptionHelper.isPremiumUser(userId);

    return {
      ...user,
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
}
