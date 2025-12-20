import { Module } from '@nestjs/common';
import { WeakAreaController } from './weak-area.controller';
import { WeakAreaService } from './weak-area.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { QuotaService } from '../common/services/quota.service';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [WeakAreaController],
  providers: [WeakAreaService, QuotaService],
  exports: [WeakAreaService],
})
export class WeakAreaModule {}
