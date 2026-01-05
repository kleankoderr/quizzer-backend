import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';
import { OtpEmailListener } from './listeners/otp-email.listener';
import { PasswordResetListener } from './listeners/password-reset.listener';

@Global()
@Module({
  providers: [EmailService, OtpEmailListener, PasswordResetListener],
  exports: [EmailService],
})
export class EmailModule {}
