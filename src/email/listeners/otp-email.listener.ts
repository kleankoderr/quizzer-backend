import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OtpEmailEvent } from '../events/otp-email.event';
import { EmailService } from '../email.service';
import { getOtpEmailTemplate } from '../templates/otp-email.template';

@Injectable()
export class OtpEmailListener {
  private readonly logger = new Logger(OtpEmailListener.name);

  constructor(private readonly emailService: EmailService) {}

  @OnEvent('otp.send')
  async handleOtpEmailEvent(event: OtpEmailEvent) {
    this.logger.log(`Sending OTP email to ${event.email}`);

    try {
      const html = getOtpEmailTemplate(event.name, event.otp);

      await this.emailService.sendEmail({
        to: event.email,
        subject: 'Verify Your Email',
        html,
        text: `Hello ${event.name}, Your OTP verification code is: ${event.otp}. It expires in 10 minutes.`,
      });

      this.logger.log(`OTP email sent successfully to ${event.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${event.email}`,
        error.stack
      );
    }
  }
}
