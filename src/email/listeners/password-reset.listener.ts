import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PasswordResetEvent } from '../events/password-reset.event';
import { EmailService } from '../email.service';
import { getPasswordResetTemplate } from '../templates/password-reset.template';

@Injectable()
export class PasswordResetListener {
  private readonly logger = new Logger(PasswordResetListener.name);

  constructor(private readonly emailService: EmailService) {}

  @OnEvent('password-reset.send')
  async handlePasswordResetEvent(event: PasswordResetEvent) {
    this.logger.log(`Sending password reset email to ${event.email}`);

    try {
      const html = getPasswordResetTemplate(event.name, event.otp);

      await this.emailService.sendEmail({
        to: event.email,
        subject: 'Reset Your Password',
        html,
        text: `Hello ${event.name}, Your password reset code is: ${event.otp}. It expires in 10 minutes.`,
      });

      this.logger.log(
        `Password reset email sent successfully to ${event.email}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${event.email}`,
        error.stack
      );
    }
  }
}
