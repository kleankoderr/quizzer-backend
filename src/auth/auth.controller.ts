import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Res,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response, Request } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import {
  SignupDto,
  LoginDto,
  AuthResponseDto,
  GoogleAuthDto,
} from "./dto/auth.dto";
import { generateCsrfToken } from "../config/csrf.config";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("csrf-token")
  @ApiOperation({ summary: "Get CSRF token" })
  @ApiResponse({ status: 200, description: "CSRF token retrieved" })
  getCsrfToken(@Req() req: Request, @Res() res: Response) {
    const csrfToken = generateCsrfToken(req, res);
    return res.json({ csrfToken });
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) //
  @Post("signup")
  @ApiOperation({ summary: "Create a new user account" })
  @ApiResponse({
    status: 201,
    description: "User successfully created",
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "User with this email already exists",
  })
  async signup(
    @Body() signupDto: SignupDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, accessToken } = await this.authService.signup(signupDto);
    this.setCookie(res, accessToken);
    return { user, accessToken, message: "Account created successfully." };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("login")
  @ApiOperation({ summary: "Sign in with email and password" })
  @ApiResponse({
    status: 200,
    description: "Login successful",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, accessToken } = await this.authService.login(loginDto);
    this.setCookie(res, accessToken);
    return { user, accessToken };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("google")
  @ApiOperation({ summary: "Sign in with Google" })
  @ApiResponse({
    status: 200,
    description: "Google login successful",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: "Invalid Google token" })
  async googleLogin(
    @Body() googleAuthDto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, accessToken } =
      await this.authService.googleLogin(googleAuthDto);
    this.setCookie(res, accessToken);
    return { user, accessToken };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "User profile retrieved" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async getCurrentUser(@CurrentUser("sub") userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout current user" })
  @ApiResponse({ status: 200, description: "Logged out successfully" })
  async logout(@Res({ passthrough: true }) res: Response) {
    const isProduction = process.env.NODE_ENV === "production";

    res.clearCookie("Authentication", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    });
    return { message: "Logged out successfully" };
  }

  private setCookie(res: Response, token: string) {
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("Authentication", token, {
      httpOnly: true,
      secure: isProduction, // Required for SameSite: 'None'
      sameSite: isProduction ? "none" : "lax", // 'None' for cross-domain in prod, 'Lax' for local dev
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path: "/", // Ensure cookie is available for all paths
    });
  }
}
