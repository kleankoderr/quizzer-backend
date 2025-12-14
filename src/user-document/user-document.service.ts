import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserDocumentDto } from './dto/user-document.dto';
import {
  IFileStorageService,
  FILE_STORAGE_SERVICE,
} from '../file-storage/interfaces/file-storage.interface';
import { DocumentHashService } from '../file-storage/services/document-hash.service';
import { processFileUploads } from '../common/helpers/file-upload.helpers';

@Injectable()
export class UserDocumentService {
  private readonly logger = new Logger(UserDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('GOOGLE_FILE_STORAGE_SERVICE')
    private readonly googleFileStorageService: IFileStorageService,
    @Inject(FILE_STORAGE_SERVICE)
    private readonly cloudinaryFileStorageService: IFileStorageService,
    private readonly documentHashService: DocumentHashService
  ) {}

  /**
   * Sanitize display name by replacing special characters with underscores
   * Example: "2874-Week+6-+Introduction+to+Python.pdf" -> "2874_Week_6_Introduction_to_Python.pdf"
   */
  private sanitizeDisplayName(filename: string): string {
    // Replace special characters (except dots for file extensions) with underscores
    // Keep alphanumeric, dots, and replace everything else with underscore
    return filename.replaceAll(/[^a-zA-Z0-9.]+/g, '_');
  }

  /**
   * Get all documents for a user with file details
   */
  async getUserDocuments(userId: string): Promise<UserDocumentDto[]> {
    const userDocuments = await this.prisma.userDocument.findMany({
      where: { userId },
      include: {
        document: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            cloudinaryUrl: true,
            googleFileUrl: true,
          },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return userDocuments.map((ud) => ({
      id: ud.id,
      displayName: this.sanitizeDisplayName(ud.displayName),
      uploadedAt: ud.uploadedAt,
      document: ud.document,
    }));
  }

  /**
   * Get a specific user document by ID
   */
  async getUserDocumentById(
    userId: string,
    userDocumentId: string
  ): Promise<UserDocumentDto> {
    const userDocument = await this.prisma.userDocument.findFirst({
      where: {
        id: userDocumentId,
        userId,
      },
      include: {
        document: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            cloudinaryUrl: true,
            googleFileUrl: true,
          },
        },
      },
    });

    if (!userDocument) {
      throw new NotFoundException(
        `User document with ID ${userDocumentId} not found`
      );
    }

    return {
      id: userDocument.id,
      displayName: userDocument.displayName,
      uploadedAt: userDocument.uploadedAt,
      document: userDocument.document,
    };
  }

  /**
   * Create a reference to a document for a user
   */
  async createUserDocument(
    userId: string,
    documentId: string,
    displayName?: string
  ): Promise<UserDocumentDto> {
    // Check if document exists
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Check if user already has this document
    const existing = await this.prisma.userDocument.findUnique({
      where: {
        userId_documentId: {
          userId,
          documentId,
        },
      },
    });

    if (existing) {
      this.logger.debug(
        `User ${userId} already has reference to document ${documentId}`
      );
      return this.getUserDocumentById(userId, existing.id);
    }

    // Create the reference with sanitized display name
    const sanitizedDisplayName = this.sanitizeDisplayName(
      displayName || document.fileName
    );

    const userDocument = await this.prisma.userDocument.create({
      data: {
        userId,
        documentId,
        displayName: sanitizedDisplayName,
      },
      include: {
        document: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            cloudinaryUrl: true,
            googleFileUrl: true,
          },
        },
      },
    });

    this.logger.log(
      `Created user document reference: ${userDocument.id} for user ${userId}`
    );

    return {
      id: userDocument.id,
      displayName: userDocument.displayName,
      uploadedAt: userDocument.uploadedAt,
      document: userDocument.document,
    };
  }

  /**
   * Dereference a document (soft delete from user's perspective)
   */
  async deleteUserDocument(
    userId: string,
    userDocumentId: string
  ): Promise<void> {
    const userDocument = await this.prisma.userDocument.findFirst({
      where: {
        id: userDocumentId,
        userId,
      },
    });

    if (!userDocument) {
      throw new NotFoundException(
        `User document with ID ${userDocumentId} not found`
      );
    }

    await this.prisma.userDocument.delete({
      where: { id: userDocumentId },
    });

    this.logger.log(
      `Deleted user document reference: ${userDocumentId} for user ${userId}`
    );
  }

  /**
   * Get multiple user documents by IDs
   */
  async getUserDocumentsByIds(
    userId: string,
    userDocumentIds: string[]
  ): Promise<UserDocumentDto[]> {
    const userDocuments = await this.prisma.userDocument.findMany({
      where: {
        id: { in: userDocumentIds },
        userId,
      },
      include: {
        document: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            cloudinaryUrl: true,
            googleFileUrl: true,
            googleFileId: true,
          },
        },
      },
    });

    return userDocuments.map((ud) => ({
      id: ud.id,
      displayName: this.sanitizeDisplayName(ud.displayName),
      uploadedAt: ud.uploadedAt,
      document: ud.document,
    }));
  }

  /**
   * Count how many users reference a document
   */
  async getDocumentReferenceCount(documentId: string): Promise<number> {
    return this.prisma.userDocument.count({
      where: { documentId },
    });
  }

  /**
   * Get documents with zero references (for cleanup)
   */
  async getUnreferencedDocuments(): Promise<string[]> {
    const documents = await this.prisma.document.findMany({
      include: {
        _count: {
          select: { userDocuments: true },
        },
      },
    });

    return documents
      .filter((doc) => doc._count.userDocuments === 0)
      .map((doc) => doc.id);
  }

  /**
   * Upload files and create UserDocument references
   */
  async uploadFiles(
    userId: string,
    files: Express.Multer.File[]
  ): Promise<UserDocumentDto[]> {
    if (!files || files.length === 0) {
      return [];
    }

    this.logger.log(`Uploading ${files.length} file(s) for user ${userId}`);

    try {
      // Process file uploads (upload to storage and create Document records)
      const processedDocs = await processFileUploads(
        files,
        this.documentHashService,
        this.cloudinaryFileStorageService,
        this.googleFileStorageService
      );

      // Create UserDocument references for each uploaded file
      const userDocuments: UserDocumentDto[] = [];

      for (const doc of processedDocs) {
        // Check if user already has a reference to this document
        const existingUserDoc = await this.prisma.userDocument.findUnique({
          where: {
            userId_documentId: {
              userId,
              documentId: doc.documentId,
            },
          },
          include: {
            document: {
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                cloudinaryUrl: true,
                googleFileUrl: true,
              },
            },
          },
        });

        if (existingUserDoc) {
          // User already has this document, return existing reference
          this.logger.debug(
            `User ${userId} already has reference to document ${doc.documentId}, skipping duplicate`
          );
          userDocuments.push({
            id: existingUserDoc.id,
            displayName: existingUserDoc.displayName,
            uploadedAt: existingUserDoc.uploadedAt,
            document: existingUserDoc.document,
          });
        } else {
          // Create new reference with sanitized name
          const userDoc = await this.createUserDocument(
            userId,
            doc.documentId,
            doc.originalName
          );
          userDocuments.push(userDoc);
        }
      }

      this.logger.log(
        `Successfully uploaded ${userDocuments.length} file(s) for user ${userId}`
      );

      return userDocuments;
    } catch (error) {
      this.logger.error(
        `Failed to upload files for user ${userId}:`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Clean up unreferenced documents
   * This should be called by a scheduled job
   */
  async cleanupUnreferencedDocuments(): Promise<number> {
    const unreferencedIds = await this.getUnreferencedDocuments();

    if (unreferencedIds.length === 0) {
      this.logger.debug('No unreferenced documents to clean up');
      return 0;
    }

    const result = await this.prisma.document.deleteMany({
      where: {
        id: { in: unreferencedIds },
      },
    });

    this.logger.log(
      `Cleaned up ${result.count} unreferenced document(s): ${unreferencedIds.join(', ')}`
    );

    return result.count;
  }
}
