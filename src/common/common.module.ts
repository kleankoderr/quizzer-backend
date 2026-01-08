import { Module, Global } from '@nestjs/common';
import { QuotaService } from './services/quota.service';
import { SubscriptionHelperService } from './services/subscription-helper.service';
import { PlatformSettingsService } from './services/platform-settings.service';
import { CacheService } from './services/cache.service';
import { QuotaGuard } from './guards/quota.guard';
import { PremiumGuard } from './guards/premium.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';

@Global()
@Module({
  imports: [PrismaModule, CacheModule],
  providers: [
    QuotaService,
    SubscriptionHelperService,
    PlatformSettingsService,
    CacheService,
    QuotaGuard,
    PremiumGuard,
  ],
  exports: [
    QuotaService,
    SubscriptionHelperService,
    PlatformSettingsService,
    CacheService,
    QuotaGuard,
    PremiumGuard,
  ],
})
export class CommonModule {}
