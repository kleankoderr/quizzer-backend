import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailOptions } from './interfaces/email.interface';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const user = this.configService.get<string>('EMAIL_USER');
    const pass = this.configService.get<string>('EMAIL_APP_PASSWORD');

    if (!user || !pass) {
      this.logger.warn(
        'Email service not fully configured. EMAIL_USER and/or EMAIL_APP_PASSWORD missing.'
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    });

    this.logger.log(`Email service initialized with user: ${user}`);
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.error(
        'Email transporter not initialized. Cannot send email.'
      );
      return;
    }

    const fromName = this.configService.get<string>(
      'EMAIL_FROM_NAME',
      'Quizzer App'
    );
    const fromAddress = this.configService.get<string>('EMAIL_USER');

    const mailOptions = {
      from: `"${fromName}" <${fromAddress}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email sent to ${options.to}. MessageId: ${info.messageId}`
      );
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error.stack);
      throw error;
    }
  }
}
