import { Injectable, Logger } from '@nestjs/common';
import { InputHandler } from './input-handler.abstract';
import { InputSource, InputSourceType } from '../input-source.interface';
import { DocumentIngestionService } from '../../rag/document-ingestion.service';
import { UserDocumentService } from '../../user-document/user-document.service';

/**
 * Handles file uploads (PDFs, documents, etc.)
 * Extracts file content and creates user document references
 */
@Injectable()
export class FileInputHandler extends InputHandler {
  private readonly logger = new Logger(FileInputHandler.name);

  constructor(
    private readonly documentIngestionService: DocumentIngestionService,
    private readonly userDocumentService: UserDocumentService
  ) {
    super();
  }

  protected canHandle(dto: any): boolean {
    return !!(dto.files && dto.files.length > 0);
  }

  protected async processInput(dto: any): Promise<InputSource[]> {
    const sources: InputSource[] = [];

    for (const file of dto.files) {
      try {
        // Create user document reference if documentId is provided
        if (file.documentId && dto.userId) {
          await this.userDocumentService.createUserDocument(
            dto.userId,
            file.documentId,
            file.originalname
          );
          this.logger.debug(
            `Created UserDocument reference for ${file.originalname}`
          );
        }

        // Skip if no URL available
        if (!file.cloudinaryUrl && !file.googleFileUrl) {
          this.logger.warn(
            `Skipping file ${file.originalname}: No URL provided`
          );
          continue;
        }

        // Extract content from file
        const tempFile = {
          originalname: file.originalname,
          mimetype: file.mimetype || 'application/octet-stream',
          size: file.size || 0,
          path: file.cloudinaryUrl || file.googleFileUrl,
        };

        const content =
          await this.documentIngestionService.extractFileContent(tempFile);

        // Skip if extracted content is empty
        if (!content || content.trim().length === 0) {
          this.logger.warn(
            `Skipping file ${file.originalname}: Empty content after extraction`
          );
          continue;
        }

        sources.push({
          type: InputSourceType.FILE,
          content,
          metadata: {
            originalName: file.originalname,
            url: file.cloudinaryUrl || file.googleFileUrl,
            fileType: file.mimetype,
          },
        });

        this.logger.debug(
          `Successfully processed file ${file.originalname} (${content.length} chars)`
        );
      } catch (error) {
        // Log error but don't fail - allow other files to be processed
        this.logger.error(
          `Failed to process file ${file.originalname}: ${error.message}`,
          error.stack
        );
      }
    }

    return sources;
  }
}
