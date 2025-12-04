import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from "../file-storage/interfaces/file-storage.interface";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly fileStorageService: IFileStorageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        schoolName: true,
        grade: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Get user statistics
    const [quizCount, flashcardCount, streak, totalAttempts] =
      await Promise.all([
        this.prisma.quiz.count({ where: { userId } }),
        this.prisma.flashcardSet.count({ where: { userId } }),
        this.prisma.streak.findUnique({ where: { userId } }),
        this.prisma.attempt.count({ where: { userId } }),
      ]);

    return {
      ...user,
      statistics: {
        totalQuizzes: quizCount,
        totalFlashcards: flashcardCount,
        currentStreak: streak?.currentStreak || 0,
        longestStreak: streak?.longestStreak || 0,
        level: streak?.level || 1,
        totalXP: streak?.totalXP || 0,
        totalAttempts,
      },
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateProfileDto,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        schoolName: true,
        grade: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async updateSettings(userId: string, updateSettingsDto: UpdateSettingsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: updateSettingsDto.preferences,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        schoolName: true,
        grade: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new NotFoundException("User not found");
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: "Password changed successfully" };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Upload new avatar to Cloudinary
    const uploadResult = await this.fileStorageService.uploadFile(file, {
      folder: "quizzer/users/avatars",
      resourceType: "image",
    });

    // Delete old avatar if it exists and is from Cloudinary
    if (user.avatar && user.avatar.includes("cloudinary")) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = user.avatar.split("/");
        const filename = urlParts[urlParts.length - 1].split(".")[0];
        const folder = urlParts.slice(-3, -1).join("/");
        const publicId = `${folder}/${filename}`;
        await this.fileStorageService.deleteFile(publicId);
      } catch (error) {
        // Log but don't fail if old avatar deletion fails
      }
    }

    // Update user's avatar URL in database
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: uploadResult.secureUrl },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        schoolName: true,
        grade: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Delete user (cascade will handle related records)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: "Account deleted successfully" };
  }
}
