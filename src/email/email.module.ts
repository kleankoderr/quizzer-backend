import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';
import { OtpEmailListener } from './listeners/otp-email.listener';

@Global()
@Module({
  providers: [EmailService, OtpEmailListener],
  exports: [EmailService],
})
export class EmailModule {}
