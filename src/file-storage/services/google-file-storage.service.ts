import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  IFileStorageService,
  UploadOptions,
  UploadResult,
  TransformOptions,
} from '../interfaces/file-storage.interface';

/**
 * Google File API implementation of the file storage service
 * Uses Google's File API for temporary file storage (48-hour retention)
 * Implements file deduplication via SHA-256 hash caching
 */
@Injectable()
export class GoogleFileStorageService implements IFileStorageService {
  private readonly logger = new Logger(GoogleFileStorageService.name);
  private readonly genAI: GoogleGenAI;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    this.genAI = new GoogleGenAI({ apiKey });
    this.logger.log('Google File API configured successfully');
  }

  /**
   * Calculate SHA-256 hash of file buffer for caching
   */
  private calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Upload a file to Google File API with automatic deduplication
   * Files are cached by hash for 48 hours (matching Google's retention)
   */
  async uploadFile(
    file: Express.Multer.File,
    options?: UploadOptions
  ): Promise<UploadResult> {
    try {
      // Calculate file hash for deduplication
      const fileHash = this.calculateFileHash(file.buffer);
      const cacheKey = `google-file:${fileHash}`;

      // Check if file already uploaded (cached by hash)
      const cachedFile = await this.cacheManager.get<UploadResult>(cacheKey);
      if (cachedFile) {
        this.logger.debug(
          `File already uploaded (hash: ${fileHash}), reusing cached URI: ${cachedFile.secureUrl}`
        );
        return cachedFile;
      }

      this.logger.debug(
        `Uploading file: ${file.originalname} (${file.size} bytes) to Google File API`
      );

      // Create a Blob from the buffer (convert Buffer to Uint8Array first)
      const uint8Array = new Uint8Array(file.buffer);
      const fileBlob = new Blob([uint8Array], { type: file.mimetype });

      // Upload using the SDK
      const uploadedFile = await this.genAI.files.upload({
        file: fileBlob,
        config: {
          displayName: options?.publicId || file.originalname,
        },
      });

      // Wait for file to be processed
      let fileStatus = await this.genAI.files.get({ name: uploadedFile.name });
      let retries = 0;
      const maxRetries = 10;

      while (fileStatus.state === 'PROCESSING' && retries < maxRetries) {
        this.logger.debug(
          `File ${uploadedFile.name} is still processing, waiting...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        fileStatus = await this.genAI.files.get({ name: uploadedFile.name });
        retries++;
      }

      if (fileStatus.state === 'FAILED') {
        throw new Error('File processing failed');
      }

      this.logger.log(
        `File uploaded successfully: ${fileStatus.name} - URI: ${fileStatus.uri}`
      );

      // Map to UploadResult interface
      const result: UploadResult = {
        publicId: fileStatus.name, // e.g., "files/abc123"
        url: fileStatus.uri, // Google File URI
        secureUrl: fileStatus.uri, // Same as url for Google Files
        format: file.mimetype.split('/')[1] || 'unknown',
        bytes: fileStatus.sizeBytes
          ? Number.parseInt(fileStatus.sizeBytes)
          : file.size,
        resourceType: file.mimetype.startsWith('image/')
          ? 'image'
          : file.mimetype.startsWith('video/')
            ? 'video'
            : 'raw',
      };

      // Cache for 48 hours (172800 seconds) - matching Google's retention
      await this.cacheManager.set(cacheKey, result, 172800000); // 48 hours in ms

      return result;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(
          `API Error Response: ${JSON.stringify(error.response.data)}`
        );
        this.logger.error(`API Status: ${error.response.status}`);
      }
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Delete a file from Google File API
   * @param publicId - The file name (e.g., "files/abc123")
   */
  async deleteFile(publicId: string): Promise<void> {
    try {
      this.logger.debug(`Deleting file: ${publicId}`);

      await this.genAI.files.delete({ name: publicId });

      this.logger.log(`File deleted successfully: ${publicId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete file ${publicId}: ${error.message}`,
        error.stack
      );
      // Don't throw error for delete failures - log and continue
      // This prevents cascading failures when cleaning up
    }
  }

  /**
   * Verify if a file is still accessible in Google File API
   * Files are automatically deleted after 48 hours
   * @param publicId - The file name (e.g., "files/abc123")
   * @returns true if file exists and is accessible, false otherwise
   */
  async verifyFileAccess(publicId: string): Promise<boolean> {
    try {
      this.logger.debug(`Verifying file access: ${publicId}`);

      const fileStatus = await this.genAI.files.get({ name: publicId });

      // Check if file is in a usable state
      const isAccessible = fileStatus.state === 'ACTIVE';

      if (!isAccessible) {
        this.logger.warn(
          `File ${publicId} is not accessible (state: ${fileStatus.state})`
        );
      }

      return isAccessible;
    } catch (error) {
      // 403/404 errors mean file doesn't exist or is inaccessible
      this.logger.warn(
        `File ${publicId} verification failed: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Get the URL of a file
   * For Google File API, this returns the URI that can be used in AI prompts
   * Note: Transform options are not supported by Google File API
   */
  getFileUrl(publicId: string, _options?: TransformOptions): string {
    // For Google File API, the publicId is the URI
    return publicId;
  }
}
