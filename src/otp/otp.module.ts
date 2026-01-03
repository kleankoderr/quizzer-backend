import { Module, Global } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpCacheService } from './otp-cache.service';

@Global()
@Module({
  providers: [OtpService, OtpCacheService],
  exports: [OtpService, OtpCacheService],
})
export class OtpModule {}
