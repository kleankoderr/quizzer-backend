import { Module } from '@nestjs/common';
import { UserDocumentController } from './user-document.controller';
import { UserDocumentService } from './user-document.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FileStorageModule } from '../file-storage/file-storage.module';

@Module({
  imports: [PrismaModule, FileStorageModule],
  controllers: [UserDocumentController],
  providers: [UserDocumentService],
  exports: [UserDocumentService],
})
export class UserDocumentModule {}
