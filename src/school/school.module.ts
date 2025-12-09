import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SchoolService } from './school.service';
import { SchoolController } from './school.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [SchoolController],
  providers: [SchoolService, PrismaService],
  exports: [SchoolService],
})
export class SchoolModule {}
