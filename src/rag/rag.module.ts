import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { RagService } from './rag.service';
import { VectorStoreService } from './vector-store.service';
import { DocumentIngestionService } from './document-ingestion.service';
import { LangChainModule } from '../langchain/langchain.module';

@Module({
  imports: [ConfigModule, HttpModule, LangChainModule],
  providers: [RagService, VectorStoreService, DocumentIngestionService],
  exports: [RagService, DocumentIngestionService, VectorStoreService],
})
export class RagModule {}
