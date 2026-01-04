import { Module, Global } from '@nestjs/common';
import { QuotaService } from './services/quota.service';
import { SubscriptionHelperService } from './services/subscription-helper.service';
import { PlatformSettingsService } from './services/platform-settings.service';
import { QuotaGuard } from './guards/quota.guard';
import { PremiumGuard } from './guards/premium.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    QuotaService,
    SubscriptionHelperService,
    PlatformSettingsService,
    QuotaGuard,
    PremiumGuard,
  ],
  exports: [
    QuotaService,
    SubscriptionHelperService,
    PlatformSettingsService,
    QuotaGuard,
    PremiumGuard,
  ],
})
export class CommonModule {}
