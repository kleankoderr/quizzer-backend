import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Document } from '@langchain/core/documents';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private vectorStore: PGVectorStore;
  private readonly embeddings: GoogleGenerativeAIEmbeddings;
  private initialized = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: this.config.get('GOOGLE_AI_API_KEY'),
      model: 'text-embedding-004',
    });
  }

  async onModuleInit() {
    // Initialize vector store on module startup
    try {
      const connectionString = this.config.get('DATABASE_URL');

      this.vectorStore = await PGVectorStore.initialize(this.embeddings, {
        postgresConnectionOptions: {
          connectionString,
        },
        tableName: 'vector_documents',
        columns: {
          idColumnName: 'id',
          vectorColumnName: 'embedding',
          contentColumnName: 'content',
          metadataColumnName: 'metadata',
        },
      });

      this.initialized = true;
      this.logger.log('Vector store initialized successfully');
    } catch (error) {
      this.logger.warn(
        'Failed to initialize vector store. pgvector extension may not be installed. RAG features will be disabled.',
        error.message
      );
      this.initialized = false;
    }
  }

  /**
   * Add documents to vector store
   */
  async addDocuments(
    documents: Document[],
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('Vector store not initialized. Skipping addDocuments.');
      return;
    }
    // Add metadata to all documents
    const docsWithMetadata = documents.map((doc) => ({
      ...doc,
      metadata: { ...doc.metadata, ...metadata },
    }));

    await this.vectorStore.addDocuments(docsWithMetadata);
  }

  /**
   * Similarity search
   */
  async similaritySearch(
    query: string,
    k: number = 5,
    filter?: Record<string, any>
  ): Promise<Document[]> {
    if (!this.initialized) {
      this.logger.warn(
        'Vector store not initialized. Returning empty results.'
      );
      return [];
    }
    return await this.vectorStore.similaritySearch(query, k, filter);
  }

  /**
   * Get retriever for chains
   */
  asRetriever(options?: { k?: number; filter?: Record<string, any> }) {
    if (!this.initialized) {
      this.logger.warn(
        'Vector store not initialized. Cannot create retriever.'
      );
      return null;
    }
    return this.vectorStore.asRetriever(options);
  }

  /**
   * Delete documents by filter
   */
  async deleteDocuments(filter: Record<string, any>): Promise<void> {
    if (!this.initialized) {
      this.logger.warn(
        'Vector store not initialized. Skipping deleteDocuments.'
      );
      return;
    }
    // Custom deletion via Prisma
    await this.prisma.$executeRaw`
      DELETE FROM vector_documents
      WHERE metadata @> ${JSON.stringify(filter)}::jsonb
    `;
  }
}
