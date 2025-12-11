import { Logger } from '@nestjs/common';
import {
  DocumentHashService,
  ProviderUrls,
} from '../../file-storage/services/document-hash.service';
import { IFileStorageService } from '../../file-storage/interfaces/file-storage.interface';

const logger = new Logger('FileUploadHelpers');

export interface ProcessedDocument {
  originalName: string;
  cloudinaryUrl: string;
  cloudinaryId: string;
  googleFileUrl?: string;
  googleFileId?: string;
  hash: string;
  isDuplicate: boolean;
  documentId: string; // Database document ID for creating UserDocument references
}

export async function processFileUploads(
  files: Express.Multer.File[],
  documentHashService: DocumentHashService,
  cloudinaryService: IFileStorageService,
  googleService: IFileStorageService
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

        // Verify Google file is still accessible (48-hour retention)
        let googleFileUrl = existingDoc.googleFileUrl;
        let googleFileId = existingDoc.googleFileId;

        if (googleFileId) {
          const isAccessible =
            await googleService.verifyFileAccess(googleFileId);

          if (!isAccessible) {
            logger.log(
              `Google file expired for ${file.originalname}, re-uploading to Google...`
            );

            // Re-upload only to Google (Cloudinary is permanent)
            const googleResult = await googleService.uploadFile(file, {
              folder: 'quizzer/content',
              resourceType: 'raw',
            });

            googleFileUrl = googleResult.secureUrl;
            googleFileId = googleResult.publicId;

            // Update document with new Google file reference
            await documentHashService.updateGoogleFileReference(
              hash,
              googleFileUrl,
              googleFileId
            );

            logger.log(
              `Updated Google file reference for ${file.originalname}`
            );
          }
        }

        // Get document ID from database
        const documentId = await documentHashService.getDocumentIdByHash(hash);

        results.push({
          originalName: file.originalname,
          cloudinaryUrl: existingDoc.cloudinaryUrl,
          cloudinaryId: existingDoc.cloudinaryId,
          googleFileUrl,
          googleFileId,
          hash,
          isDuplicate: true,
          documentId,
        });
      } else {
        const urls = await uploadToProviders(
          file,
          cloudinaryService,
          googleService
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
          googleFileUrl: urls.googleFileUrl,
          googleFileId: urls.googleFileId,
          hash,
          isDuplicate: false,
          documentId,
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
  googleService: IFileStorageService
): Promise<ProviderUrls> {
  const [cloudinaryResult, googleResult] = await Promise.all([
    cloudinaryService.uploadFile(file, {
      folder: 'quizzer/content',
      resourceType: 'raw',
    }),
    googleService.uploadFile(file, {
      folder: 'quizzer/content',
      resourceType: 'raw',
    }),
  ]);

  logger.log(`Uploaded ${file.originalname} to both providers`);

  return {
    cloudinaryUrl: cloudinaryResult.secureUrl,
    cloudinaryId: cloudinaryResult.publicId,
    googleFileUrl: googleResult.secureUrl,
    googleFileId: googleResult.publicId,
  };
}

export async function cleanupFailedUploads(
  documents: ProcessedDocument[],
  cloudinaryService: IFileStorageService,
  googleService: IFileStorageService
): Promise<void> {
  for (const doc of documents) {
    if (!doc.isDuplicate) {
      try {
        await Promise.all([
          cloudinaryService.deleteFile(doc.cloudinaryId),
          doc.googleFileId
            ? googleService.deleteFile(doc.googleFileId)
            : Promise.resolve(),
        ]);
        logger.log(`Cleaned up failed upload: ${doc.originalName}`);
      } catch (error) {
        logger.warn(`Failed to cleanup ${doc.originalName}: ${error.message}`);
      }
    }
  }
}
