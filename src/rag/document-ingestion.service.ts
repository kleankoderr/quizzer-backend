import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { VectorStoreService } from './vector-store.service';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { WebPDFLoader } from '@langchain/community/document_loaders/web/pdf';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { Document } from '@langchain/core/documents';
import fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { documentProcessingConfig } from '../config/document-processing.config';

interface FileInfo {
  path: string;
  mimetype: string;
  originalname: string;
  size?: number;
}

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);

  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly httpService: HttpService
  ) {}

  /**
   * Ingest documents from files (with smart routing)
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
      chunkSize: documentProcessingConfig.chunkSize,
      chunkOverlap: documentProcessingConfig.chunkOverlap,
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
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: documentProcessingConfig.chunkSize,
      chunkOverlap: documentProcessingConfig.chunkOverlap,
    });

    const docs = await splitter.createDocuments([content]);
    await this.vectorStore.addDocuments(docs, metadata);
  }

  /**
   * Extract content from file (optimized for quiz generation)
   */
  async extractFileContent(file: FileInfo): Promise<string> {
    const docs = await this.loadDocument(file);
    return docs.map((doc) => doc.pageContent).join('\n\n');
  }

  /**
   * Smart document loading with strategy selection
   */
  private async loadDocument(file: FileInfo): Promise<Document[]> {
    this.logger.log(`Loading document: ${file.path}`);
    const isUrl = this.isUrl(file.path);
    const fileSize = file.size || 0;

    // Strategy 1: Direct URL loading for small supported files
    if (
      isUrl &&
      fileSize < documentProcessingConfig.directLoadThreshold &&
      documentProcessingConfig.supportedDirectLoadTypes.includes(file.mimetype)
    ) {
      const directLoadResult = await this.tryDirectUrlLoading(file);
      if (directLoadResult) {
        return directLoadResult;
      }
      this.logger.log(
        `Direct URL loading failed for ${file.path}, falling back to download method`
      );
    }

    // Strategy 2: Download and process locally (fallback)
    return await this.loadWithDownload(file);
  }

  /**
   * Try to load document directly from URL (NO DOWNLOAD)
   */
  private async tryDirectUrlLoading(
    file: FileInfo
  ): Promise<Document[] | null> {
    try {
      this.logger.log(`Attempting direct URL loading for: ${file.path}`);

      // PDF files
      if (file.mimetype === 'application/pdf') {
        this.logger.debug(`Fetching PDF as Blob: ${file.path}`);
        const response = await lastValueFrom(
          this.httpService.get(file.path, { responseType: 'arraybuffer' })
        );

        const blob = new Blob([response.data]);
        const loader = new WebPDFLoader(blob, {
          splitPages: true,
          parsedItemSeparator: '\n',
        });
        const docs = await loader.load();

        this.logger.log(
          `✅ Successfully loaded PDF directly from URL (${docs.length} pages)`
        );
        return docs;
      }

      // HTML/Text files
      if (file.mimetype === 'text/html' || file.mimetype === 'text/plain') {
        const loader = new CheerioWebBaseLoader(file.path);
        const docs = await loader.load();

        this.logger.log(
          `✅ Successfully loaded ${file.mimetype} directly from URL`
        );
        return docs;
      }

      // Markdown files - treat as text
      if (file.mimetype === 'text/markdown') {
        const response = await lastValueFrom(
          this.httpService.get(file.path, { responseType: 'text' })
        );

        return [
          new Document({
            pageContent: response.data,
            metadata: { source: file.originalname, type: 'markdown' },
          }),
        ];
      }

      // Type not supported for direct loading
      return null;
    } catch (error) {
      this.logger.warn(
        `Direct URL loading failed for ${file.path}, falling back to download method: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Load document with download (original method - fallback)
   */
  private async loadWithDownload(file: FileInfo): Promise<Document[]> {
    const fileType = file.mimetype;
    let filePath = file.path;
    let isTemporaryFile = false;

    try {
      // If path is a URL, download from Cloudinary first
      if (this.isUrl(file.path)) {
        this.logger.log(
          `📥 Downloading file from URL: ${file.path} (Direct loading not available or failed)`
        );
        filePath = await this.downloadFileFromUrl(file.path, file.mimetype);
        isTemporaryFile = true;
      }

      // Load document based on file type
      if (fileType === 'application/pdf') {
        const loader = new PDFLoader(filePath);
        return await loader.load();
      }

      // For text files, read content directly
      if (fileType.startsWith('text/')) {
        const content = await fs.readFile(filePath, 'utf-8');
        return [
          new Document({
            pageContent: content,
            metadata: { source: file.originalname },
          }),
        ];
      }

      throw new Error(`Unsupported file type: ${fileType}`);
    } finally {
      // Clean up temporary file if we created one
      if (isTemporaryFile && filePath) {
        try {
          await fs.unlink(filePath);
          this.logger.debug(`🧹 Cleaned up temporary file: ${filePath}`);
        } catch (error) {
          this.logger.warn(
            `Failed to cleanup temporary file ${filePath}: ${error.message}`
          );
        }
      }
    }
  }

  /**
   * Check if a path is a URL
   */
  private isUrl(path: string): boolean {
    return path.startsWith('http://') || path.startsWith('https://');
  }

  /**
   * Download file from Cloudinary URL to temporary location
   */
  private async downloadFileFromUrl(
    url: string,
    mimetype: string
  ): Promise<string> {
    try {
      this.logger.debug(`Downloading file from: ${url}`);

      const response = await lastValueFrom(
        this.httpService.get(url, { responseType: 'arraybuffer' })
      );

      const buffer = Buffer.from(response.data);
      const extension = this.getExtensionFromMimetype(mimetype);
      const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}${extension}`);

      await fs.writeFile(tempFilePath, buffer);

      this.logger.debug(
        `File downloaded to temp location: ${tempFilePath} (${buffer.length} bytes)`
      );

      return tempFilePath;
    } catch (error) {
      this.logger.error(
        `Failed to download file from ${url}: ${error.message}`
      );
      throw new Error(
        `Failed to download file from Cloudinary: ${error.message}`
      );
    }
  }

  /**
   * Get file extension from mimetype
   */
  private getExtensionFromMimetype(mimetype: string): string {
    const mimetypeMap: Record<string, string> = {
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'text/html': '.html',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        '.docx',
      'application/msword': '.doc',
    };
    return mimetypeMap[mimetype] || '.tmp';
  }
}
