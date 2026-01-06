import { Module, Global } from '@nestjs/common';
import { SubscriptionHelperService } from './services/subscription-helper.service';
import { PlatformSettingsService } from './services/platform-settings.service';
import { PremiumGuard } from './guards/premium.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [SubscriptionHelperService, PlatformSettingsService, PremiumGuard],
  exports: [SubscriptionHelperService, PlatformSettingsService, PremiumGuard],
})
export class CommonModule {}
