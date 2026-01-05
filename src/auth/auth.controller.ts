import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Res,
  Req,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
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
} from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } }) //
  @Post('signup')
  @ApiOperation({ summary: 'Create a new user account' })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists',
  })
  async signup(
    @Body() signupDto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.signup(signupDto);

    if ('requiresVerification' in result && result.requiresVerification) {
      return result;
    }

    const { user, accessToken } = result as any;
    this.setCookie(res, accessToken, req);
    return { user, accessToken, message: 'Account created successfully.' };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(loginDto);

    if ('requiresVerification' in result && result.requiresVerification) {
      return result;
    }

    const { user, accessToken } = result as any;
    this.setCookie(res, accessToken, req);
    return { user, accessToken };
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email address with OTP' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid OTP' })
  @ApiResponse({ status: 403, description: 'Too many attempts' })
  @HttpCode(200)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.verifyEmail(dto.email, dto.otp);
    const { user, accessToken } = result as any;
    this.setCookie(res, accessToken, req);
    return { user, accessToken, message: 'Email verified successfully.' };
  }

  @Post('resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Resend OTP verification email' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @HttpCode(200)
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('google')
  @ApiOperation({ summary: 'Sign in with Google' })
  @ApiResponse({
    status: 200,
    description: 'Google login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid Google token' })
  async googleLogin(
    @Body() googleAuthDto: GoogleAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, accessToken } =
      await this.authService.googleLogin(googleAuthDto);
    this.setCookie(res, accessToken, req);
    return { user, accessToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUser(@CurrentUser('sub') userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.otp, dto.password);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const isProduction = process.env.NODE_ENV === 'production';

    // Extract token for blacklisting
    const token =
      req?.cookies?.Authentication ||
      req?.headers?.authorization?.replace('Bearer ', '');

    // Blacklist token with precise remaining lifetime
    if (token) {
      const remainingTime =
        await this.authService.calculateTokenRemainingTime(token);
      if (remainingTime > 0) {
        await this.authService.blacklistToken(token, remainingTime);
      }
    }

    res.clearCookie('Authentication', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
    return { message: 'Logged out successfully' };
  }

  private setCookie(res: Response, token: string, req?: Request) {
    const isProduction = process.env.NODE_ENV === 'production';

    // Detect mobile browser for longer cookie expiration
    const userAgent = req?.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

    // 7 days for mobile, 1 day for desktop
    const maxAge = isMobile ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    res.cookie('Authentication', token, {
      httpOnly: true,
      secure: isProduction, // Required for SameSite: 'None'
      sameSite: isProduction ? 'none' : 'lax', // 'None' for cross-domain in prod, 'Lax' for local dev
      maxAge,
      path: '/', // Ensure cookie is available for all paths
      domain: process.env.COOKIE_DOMAIN, // For subdomain support (e.g., .yourdomain.com)
    });
  }
}
