import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CloudinaryFileStorageService } from "./services/cloudinary-file-storage.service";
import { FILE_STORAGE_SERVICE } from "./interfaces/file-storage.interface";

/**
 * Global module that provides file storage service
 * To switch providers, simply change the useClass in the provider below
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: FILE_STORAGE_SERVICE,
      useClass: CloudinaryFileStorageService, // <-- Change this to switch providers
    },
  ],
  exports: [FILE_STORAGE_SERVICE],
})
export class FileStorageModule {}
