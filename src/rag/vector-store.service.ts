import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Document } from '@langchain/core/documents';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private vectorStore: PGVectorStore;
  private readonly embeddings: GoogleGenerativeAIEmbeddings;

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
  }

  /**
   * Add documents to vector store
   */
  async addDocuments(
    documents: Document[],
    metadata?: Record<string, any>
  ): Promise<void> {
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
    return await this.vectorStore.similaritySearch(query, k, filter);
  }

  /**
   * Get retriever for chains
   */
  asRetriever(options?: { k?: number; filter?: Record<string, any> }) {
    return this.vectorStore.asRetriever(options);
  }

  /**
   * Delete documents by filter
   */
  async deleteDocuments(filter: Record<string, any>): Promise<void> {
    // Custom deletion via Prisma
    await this.prisma.$executeRaw`
      DELETE FROM vector_documents
      WHERE metadata @> ${JSON.stringify(filter)}::jsonb
    `;
  }
}
