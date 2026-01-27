import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LangChainService } from './langchain.service';
import { ModelConfigService } from './model-config.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LangChainService, ModelConfigService],
  exports: [LangChainService, ModelConfigService],
})
export class LangChainModule {}
