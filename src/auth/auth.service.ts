import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { SignupDto, LoginDto, GoogleAuthDto } from "./dto/auth.dto";
import { auth } from "../config/firebase.config";

import { SchoolService } from "../school/school.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly schoolService: SchoolService
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password, name } = signupDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException("User with this email already exists");
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
      throw new UnauthorizedException("Invalid credentials");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password ?? "");

    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.generateAuthResponse(user);
  }

  async googleLogin(googleAuthDto: GoogleAuthDto) {
    const { idToken } = googleAuthDto;

    try {
      // Verify the Google ID token using Firebase Admin
      const decodedToken = await auth.verifyIdToken(idToken);

      const { email, name, picture, uid } = decodedToken;

      if (!email) {
        throw new UnauthorizedException("Email not found in Google token");
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
        // Create new user
        user = await this.prisma.user.create({
          data: {
            email,
            name: name || email.split("@")[0],
            googleId: uid,
            avatar: picture,
            password: null, // No password for Google users
          },
        });
      }

      return this.generateAuthResponse(user);
    } catch (error) {
      throw new UnauthorizedException("Invalid Google token");
    }
  }

  private generateAuthResponse(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        schoolName: user.schoolName,
        grade: user.grade,
        role: user.role,
        createdAt: user.createdAt,
      },
      accessToken: this.jwtService.sign(payload),
    };
  }

  async getCurrentUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        schoolName: true,
        grade: true,
        role: true,
        createdAt: true,
      },
    });
  }
}
