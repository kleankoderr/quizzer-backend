import { Module } from '@nestjs/common';
import { StudyPackService } from './study-pack.service';
import { StudyPackController } from './study-pack.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudyPackController],
  providers: [StudyPackService],
  exports: [StudyPackService],
})
export class StudyPackModule {}
