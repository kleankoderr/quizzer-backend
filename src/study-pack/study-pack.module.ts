import { Module } from '@nestjs/common';
import { StudyPackService } from './study-pack.service';
import { StudyPackController } from './study-pack.controller';
import { AdminStudyPackController } from './admin-study-pack.controller';
import { AdminStudyPackService } from './admin-study-pack.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudyPackController, AdminStudyPackController],
  providers: [StudyPackService, AdminStudyPackService],
  exports: [StudyPackService],
})
export class StudyPackModule {}
