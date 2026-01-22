import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  SignupDto,
  LoginDto,
  AuthResponseDto,
  GoogleAuthDto,
  VerifyEmailDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from './dto/auth.dto';

const THROTTLE_LIMITS = {
  STRICT: { limit: 3, ttl: 60000 }, // 3 requests per minute
  NORMAL: { limit: 5, ttl: 60000 }, // 5 requests per minute
} as const;

interface AuthResult {
  user: any;
  accessToken: string;
}

interface VerificationRequiredResult {
  requiresVerification: boolean;
  message: string;
  email: string;
}

type AuthServiceResult = AuthResult | VerificationRequiredResult;

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  /**
   * User Registration
   * Creates a new user account with email verification
   */
  @Throttle({ default: THROTTLE_LIMITS.NORMAL })
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user account' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully created',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User with this email already exists',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many requests',
  })
  async signup(@Body() signupDto: SignupDto) {
    const result = await this.authService.signup(signupDto);

    // Handle email verification requirement
    if (this.requiresVerification(result)) {
      return result;
    }

    // Successful signup - return tokens in response
    const { user, accessToken, refreshToken } = result;

    return {
      user,
      accessToken,
      refreshToken,
      message: 'Account created successfully.',
    };
  }

  /**
   * User Login
   * Authenticates user with email and password
   */
  @Throttle({ default: THROTTLE_LIMITS.NORMAL })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many requests',
  })
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto);

    if (this.requiresVerification(result)) {
      return result;
    }

    const { user, accessToken, refreshToken } = result;

    return {
      user,
      accessToken,
      refreshToken,
      message: 'Login successful.',
    };
  }

  /**
   * Email Verification
   * Verifies user email with OTP code
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with OTP' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email verified successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid OTP',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Too many attempts',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const { user, accessToken, refreshToken } =
      await this.authService.verifyEmail(dto.email, dto.otp);

    return {
      user,
      accessToken,
      refreshToken,
      message: 'Email verified successfully.',
    };
  }

  /**
   * Resend OTP
   * Sends a new verification OTP to the user's email
   */
  @Throttle({ default: THROTTLE_LIMITS.STRICT })
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP verification email' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP sent successfully',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many requests',
  })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  /**
   * Google Authentication
   * Authenticates user using Google OAuth
   */
  @Throttle({ default: THROTTLE_LIMITS.NORMAL })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Google' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Google login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid Google token',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many requests',
  })
  async googleLogin(@Body() googleAuthDto: GoogleAuthDto) {
    const { user, accessToken, refreshToken } =
      await this.authService.googleLogin(googleAuthDto);

    return {
      user,
      accessToken,
      refreshToken,
      message: 'Google login successful.',
    };
  }

  /**
   * Get Current User
   * Retrieves the authenticated user's profile
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile retrieved',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized',
  })
  async getCurrentUser(@CurrentUser('sub') userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  /**
   * Refresh Access Token
   * Generates a new access token using a valid refresh token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token refreshed successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired refresh token',
  })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  /**
   * Forgot Password
   * Sends a password reset OTP to the user's email
   */
  @Throttle({ default: THROTTLE_LIMITS.STRICT })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP sent successfully',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many requests',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * Reset Password
   * Resets user password using OTP verification
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset successful',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid OTP',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.otp, dto.password);
  }

  /**
   * Logout
   * Logs out the current user and invalidates the session
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged out successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized',
  })
  async logout(@CurrentUser('sub') userId: string, @Req() req: Request) {
    try {
      // Extract and blacklist access token
      const token = this.extractToken(req);

      if (token) {
        await this.blacklistToken(token);
      }

      // Revoke refresh token
      await this.authService.revokeRefreshToken(userId);

      return { message: 'Logged out successfully' };
    } catch (error) {
      // Attempt to revoke refresh token even if blacklisting fails
      await this.authService.revokeRefreshToken(userId).catch(() => {});
      throw error;
    }
  }

  /**
   * PRIVATE HELPER METHODS
   */

  /**
   * Type guard to check if result requires verification
   */
  private requiresVerification(
    result: any
  ): result is VerificationRequiredResult {
    return !!(
      result &&
      'requiresVerification' in result &&
      result.requiresVerification === true
    );
  }

  /**
   * Extracts JWT token from request (Authorization header only)
   */
  private extractToken(req: Request): string | null {
    return req?.headers?.authorization?.replace('Bearer ', '') || null;
  }

  /**
   * Blacklists a token with its remaining lifetime
   */
  private async blacklistToken(token: string): Promise<void> {
    try {
      const remainingTime =
        await this.authService.calculateTokenRemainingTime(token);

      if (remainingTime > 0) {
        await this.authService.blacklistToken(token, remainingTime);
      }
    } catch (error) {
      this.logger.error('Failed to blacklist token: {}', error);
    }
  }
}
