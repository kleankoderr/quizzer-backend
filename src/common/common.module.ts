import { Global, Module } from '@nestjs/common';
import { QuotaService } from './services/quota.service';
import { SubscriptionHelperService } from './services/subscription-helper.service';
import { PlatformSettingsService } from './services/platform-settings.service';
import { CacheService } from './services/cache.service';
import { DatabaseBufferService } from './services/database-buffer.service';
import { GenerationCacheService } from './services/generation-cache.service';
import { QuotaGuard } from './guards/quota.guard';
import { PremiumGuard } from './guards/premium.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';

import { PlatformSettingsController } from './controllers/platform-settings.controller';

@Global()
@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [PlatformSettingsController],
  providers: [
    QuotaService,
    SubscriptionHelperService,
    PlatformSettingsService,
    CacheService,
    DatabaseBufferService,
    GenerationCacheService,
    QuotaGuard,
    PremiumGuard,
  ],
  exports: [
    QuotaService,
    SubscriptionHelperService,
    PlatformSettingsService,
    CacheService,
    DatabaseBufferService,
    GenerationCacheService,
    QuotaGuard,
    PremiumGuard,
  ],
})
export class CommonModule {}
