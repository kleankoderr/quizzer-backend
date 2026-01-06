import { Module, Global } from '@nestjs/common';
import { FileStorageService } from './services/file-storage.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule, SubscriptionModule],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class StorageModule {}
