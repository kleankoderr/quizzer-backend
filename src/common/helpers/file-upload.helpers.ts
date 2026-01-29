import { Logger } from '@nestjs/common';
import { DocumentHashService, ProviderUrls } from '../../file-storage/services/document-hash.service';
import { IFileStorageService } from '../../file-storage/interfaces/file-storage.interface';
import { FileCompressionService } from '../../file-storage/services/file-compression.service';

const logger = new Logger('FileUploadHelpers');

export interface ProcessedDocument {
  originalName: string;
  cloudinaryUrl: string;
  cloudinaryId: string;
  hash: string;
  isDuplicate: boolean;
  documentId: string;
  mimeType: string;
  size: number;
}

export async function processFileUploads(
  files: Express.Multer.File[],
  documentHashService: DocumentHashService,
  cloudinaryService: IFileStorageService,
  compressionService: FileCompressionService
): Promise<ProcessedDocument[]> {
  const results: ProcessedDocument[] = [];

  for (const file of files) {
    try {
      const hash = await documentHashService.calculateFileHash(file.buffer);
      const existingDoc = await documentHashService.findDocumentByHash(hash);

      if (existingDoc) {
        logger.log(
          `Duplicate file detected: ${file.originalname} (${hash.substring(0, 8)}...)`
        );

        // Get document ID from database
        const documentId = await documentHashService.getDocumentIdByHash(hash);

        results.push({
          originalName: file.originalname,
          cloudinaryUrl: existingDoc.cloudinaryUrl,
          cloudinaryId: existingDoc.cloudinaryId,
          hash,
          isDuplicate: true,
          documentId,
          mimeType: existingDoc.mimeType,
          size: existingDoc.sizeBytes || file.size || 0,
        });
      } else {
        const urls = await uploadToProviders(
          file,
          cloudinaryService,
          compressionService
        );
        const documentId = await documentHashService.storeDocumentMetadata(
          hash,
          urls,
          file
        );

        results.push({
          originalName: file.originalname,
          cloudinaryUrl: urls.cloudinaryUrl,
          cloudinaryId: urls.cloudinaryId,
          hash,
          isDuplicate: false,
          documentId,
          mimeType: file.mimetype,
          size: file.size,
        });
      }
    } catch (error) {
      logger.error(
        `Failed to process file ${file.originalname}: ${error.message}`
      );
      throw error;
    }
  }

  return results;
}

export async function uploadToProviders(
  file: Express.Multer.File,
  cloudinaryService: IFileStorageService,
  compressionService: FileCompressionService
): Promise<ProviderUrls> {
  // Compress file once before uploading to both providers
  let processedBuffer = file.buffer;
  let processedMimetype = file.mimetype;
  const originalSize = file.buffer.length;

  logger.log(
    `Processing file: ${file.originalname} (${originalSize} bytes, ${file.mimetype})`
  );

  // Apply compression based on file type
  if (file.mimetype.startsWith('image/')) {
    logger.debug(`Compressing image...`);
    processedBuffer = await compressionService.compressImage(file.buffer);
    processedMimetype = 'image/webp';
  } else if (file.mimetype === 'application/pdf') {
    logger.debug(`Compressing PDF...`);
    processedBuffer = await compressionService.compressPDF(file.buffer);
  }

  const compressionRatio = (
    ((originalSize - processedBuffer.length) / originalSize) *
    100
  ).toFixed(2);
  logger.log(
    `File compressed: ${originalSize} → ${processedBuffer.length} bytes (${compressionRatio}% reduction)`
  );

  // Create a new file object with compressed buffer
  const compressedFile: Express.Multer.File = {
    ...file,
    buffer: processedBuffer,
    mimetype: processedMimetype,
    size: processedBuffer.length,
  };

  // Upload compressed file to both providers in parallel
  const cloudinaryResult = await
    cloudinaryService.uploadFile(compressedFile, {
      folder: 'quizzer/content',
      resourceType: 'raw',
    });

  logger.log(`Uploaded ${file.originalname} to both providers`);

  return {
    cloudinaryUrl: cloudinaryResult.secureUrl,
    cloudinaryId: cloudinaryResult.publicId,
  };
}

export async function cleanupFailedUploads(
  documents: ProcessedDocument[],
  cloudinaryService: IFileStorageService,
): Promise<void> {
  for (const doc of documents) {
    if (!doc.isDuplicate) {
      try {
        await cloudinaryService.deleteFile(doc.cloudinaryId);
        logger.log(`Cleaned up failed upload: ${doc.originalName}`);
      } catch (error) {
        logger.warn(`Failed to cleanup ${doc.originalName}: ${error.message}`);
      }
    }
  }
}
