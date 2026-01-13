import { Injectable } from '@nestjs/common';
import { VectorStoreService } from './vector-store.service';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from '@langchain/core/documents';

@Injectable()
export class DocumentIngestionService {
  constructor(private readonly vectorStore: VectorStoreService) {}

  /**
   * Ingest documents from files
   */
  async ingestFiles(
    files: Express.Multer.File[],
    metadata: {
      userId: string;
      schoolId?: string;
      studyMaterialId?: string;
      topic?: string;
    }
  ): Promise<void> {
    const allDocuments: Document[] = [];

    // Load documents from files
    for (const file of files) {
      const docs = await this.loadDocument(file);
      allDocuments.push(...docs);
    }

    // Split documents into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await splitter.splitDocuments(allDocuments);

    // Add to vector store
    await this.vectorStore.addDocuments(splitDocs, metadata);
  }

  /**
   * Ingest text content directly
   */
  async ingestText(
    content: string,
    metadata: {
      userId: string;
      title?: string;
      topic?: string;
    }
  ): Promise<void> {
    const splitter = new RecursiveCharacter TextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([content]);
    await this.vectorStore.addDocuments(docs, metadata);
  }

  private async loadDocument(file: Express.Multer.File): Promise<Document[]> {
    const fileType = file.mimetype;

    if (fileType === 'application/pdf') {
      const loader = new PDFLoader(file.path);
      return await loader.load();
    }

    // For text files, read content directly
    if (fileType.startsWith('text/')) {
      const fs = await import('fs/promises');
      const content = await fs.readFile(file.path, 'utf-8');
      return [new Document({ pageContent: content, metadata: { source: file.originalname } })];
    }

    throw new Error(`Unsupported file type: ${fileType}`);
  }
}
