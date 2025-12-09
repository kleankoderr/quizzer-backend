import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryFileStorageService } from './services/cloudinary-file-storage.service';
import { GoogleFileStorageService } from './services/google-file-storage.service';
import { DocumentHashService } from './services/document-hash.service';
import { FILE_STORAGE_SERVICE } from './interfaces/file-storage.interface';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    {
      provide: FILE_STORAGE_SERVICE,
      useClass: CloudinaryFileStorageService,
    },
    {
      provide: 'GOOGLE_FILE_STORAGE_SERVICE',
      useClass: GoogleFileStorageService,
    },
    DocumentHashService,
  ],
  exports: [
    FILE_STORAGE_SERVICE,
    'GOOGLE_FILE_STORAGE_SERVICE',
    DocumentHashService,
  ],
})
export class FileStorageModule {}
