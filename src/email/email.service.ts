import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailOptions } from './interfaces/email.interface';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromName: string;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'Email service not fully configured. RESEND_API_KEY missing.'
      );
      this.resend = null;
      return;
    }

    this.resend = new Resend(apiKey);
    this.fromName = this.configService.get<string>(
      'EMAIL_FROM_NAME',
      'Quizzer App'
    );
    this.fromAddress = this.configService
      .get<string>('EMAIL_FROM_ADDRESS')
      ?.replaceAll(/['"]/g, '')
      ?.trim();

    if (!this.fromAddress) {
      this.logger.warn(
        'EMAIL_FROM_ADDRESS not set. using default: onboarding@resend.dev'
      );
      this.fromAddress = 'onboarding@resend.dev';
    }

    this.logger.log('Email service initialized with Resend');
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.resend) {
      this.logger.error('Resend client not initialized. Cannot send email.');
      throw new Error('Email service not configured');
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      if (error) {
        this.logger.error(
          `Failed to send email to ${options.to}: ${error.message}`
        );
        throw new Error(error.message);
      }

      this.logger.log(`Email sent to ${options.to}. Id: ${data?.id}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error.stack);
      throw error;
    }
  }
}
