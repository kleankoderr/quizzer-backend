import { Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignStrategy, EmailContent } from './campaign.strategy';
import { getWelcomeBackEmailTemplate } from '../templates/welcome-back.template';
import { ConfigService } from '@nestjs/config';
import { CronExpression } from '@nestjs/schedule';

@Injectable()
export class WelcomeBackCampaign implements CampaignStrategy {
  readonly id = 'welcome-back-2026-01';
  readonly description = 'Welcome back email for inactive users';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  getCronExpression(): string {
    return this.configService.get(
      'WELCOME_BACK_CAMPAIGN_CRON',
      CronExpression.EVERY_HOUR
    );
  }

  async isEnabled(): Promise<boolean> {
    return this.configService.get('ENABLE_WELCOME_BACK_CAMPAIGN') === 'true';
  }

  async getEligibleUsers(): Promise<Partial<User>[]> {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        emailVerified: true,
        role: {
          notIn: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        schoolName: true,
      },
    });
  }

  async renderEmail(user: Partial<User>): Promise<EmailContent> {
    const html = getWelcomeBackEmailTemplate(
      user.name,
      4, // TODO: These should ideally come from real stats
      user.schoolName || undefined
    );

    return {
      subject: 'Welcome Back to Your Learning Journey! 🚀',
      html,
      text: `Hi ${user.name},\n\nWelcome back to Quizzer! Your learning journey continues.\n\nStart learning: https://quizzer.kleankoder.com\n\n- The Quizzer Team`,
    };
  }

  getDeduplicationTtlDays(): number {
    return 30;
  }
}
