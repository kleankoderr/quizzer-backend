import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChallengeModule } from '../challenge/challenge.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, ChallengeModule, AiModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
