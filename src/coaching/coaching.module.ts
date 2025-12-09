import { Module } from '@nestjs/common';
import { CoachingService } from './coaching.service';
import { CoachingController } from './coaching.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CoachingController],
  providers: [CoachingService, PrismaService],
  exports: [CoachingService],
})
export class CoachingModule {}
