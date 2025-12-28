import { Module, Global } from '@nestjs/common';
import { QuotaService } from './services/quota.service';
import { SubscriptionHelperService } from './services/subscription-helper.service';
import { QuotaGuard } from './guards/quota.guard';
import { PremiumGuard } from './guards/premium.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    QuotaService,
    SubscriptionHelperService,
    QuotaGuard,
    PremiumGuard,
  ],
  exports: [QuotaService, SubscriptionHelperService, QuotaGuard, PremiumGuard],
})
export class CommonModule {}
