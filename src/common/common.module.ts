import { Module, Global } from '@nestjs/common';
import { QuotaService } from './services/quota.service';
import { QuotaGuard } from './guards/quota.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [QuotaService, QuotaGuard],
  exports: [QuotaService, QuotaGuard],
})
export class CommonModule {}
