import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from '../file-storage/interfaces/file-storage.interface';

import { SchoolService } from '../school/school.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly fileStorageService: IFileStorageService,
    private readonly schoolService: SchoolService
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        preference: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
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
      name: user.profile?.name,
      avatar: user.profile?.avatar,
      schoolName: user.profile?.schoolName,
      grade: user.profile?.grade,
      onboardingCompleted: user.profile?.onboardingCompleted,
      assessmentPopupShown: user.profile?.assessmentPopupShown,
      preferences: user.preference?.preferences,
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
      throw new NotFoundException('User not found');
    }

    let schoolId = undefined;
    if (updateProfileDto.schoolName) {
      const school = await this.schoolService.findOrCreate(
        updateProfileDto.schoolName
      );
      schoolId = school.id;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            ...updateProfileDto,
            schoolId,
          },
        },
      },
      include: {
        profile: true,
        preference: true,
      },
    });

    return {
      ...updatedUser,
      name: updatedUser.profile?.name,
      avatar: updatedUser.profile?.avatar,
      schoolName: updatedUser.profile?.schoolName,
      schoolId: updatedUser.profile?.schoolId,
      grade: updatedUser.profile?.grade,
      onboardingCompleted: updatedUser.profile?.onboardingCompleted,
      assessmentPopupShown: updatedUser.profile?.assessmentPopupShown,
      preferences: updatedUser.preference?.preferences,
    };
  }

  async updateSettings(userId: string, updateSettingsDto: UpdateSettingsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preference: {
          update: {
            preferences: updateSettingsDto.preferences,
          },
        },
      },
      include: {
        profile: true,
        preference: true,
      },
    });

    return {
      ...updatedUser,
      name: updatedUser.profile?.name,
      avatar: updatedUser.profile?.avatar,
      schoolName: updatedUser.profile?.schoolName,
      grade: updatedUser.profile?.grade,
      onboardingCompleted: updatedUser.profile?.onboardingCompleted,
      assessmentPopupShown: updatedUser.profile?.assessmentPopupShown,
      preferences: updatedUser.preference?.preferences,
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.password) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Upload new avatar to Cloudinary
    const uploadResult = await this.fileStorageService.uploadFile(file, {
      folder: 'quizzer/users/avatars',
      resourceType: 'image',
    });

    // Delete old avatar if it exists and is from Cloudinary
    if (user.profile?.avatar?.includes('cloudinary')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = user.profile.avatar.split('/');
        const filename = urlParts[urlParts.length - 1].split('.')[0];
        const folder = urlParts.slice(-3, -1).join('/');
        const publicId = `${folder}/${filename}`;
        await this.fileStorageService.deleteFile(publicId);
      } catch (_error) {
        this.logger.error('Failed to delete old avatar', _error);
      }
    }

    // Update user's avatar URL in database (user profile)
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            avatar: uploadResult.secureUrl,
          },
        },
      },
      include: {
        profile: true,
        preference: true,
      },
    });

    return {
      ...updatedUser,
      name: updatedUser.profile?.name,
      avatar: updatedUser.profile?.avatar,
      schoolName: updatedUser.profile?.schoolName,
      grade: updatedUser.profile?.grade,
      onboardingCompleted: updatedUser.profile?.onboardingCompleted,
      assessmentPopupShown: updatedUser.profile?.assessmentPopupShown,
      preferences: updatedUser.preference?.preferences,
    };
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete user (cascade will handle related records)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'Account deleted successfully' };
  }

  async updateAssessmentPopupShown(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            assessmentPopupShown: true,
          },
        },
      },
      include: {
        profile: true, // Only need profile really
      },
    });
  }
}
