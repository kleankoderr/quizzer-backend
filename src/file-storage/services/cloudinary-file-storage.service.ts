import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import {
  IFileStorageService,
  UploadOptions,
  UploadResult,
  TransformOptions,
} from '../interfaces/file-storage.interface';
import { FileCompressionService } from './file-compression.service';

/**
 * Cloudinary implementation with aggressive compression via FileCompressionService
 */
@Injectable()
export class CloudinaryFileStorageService implements IFileStorageService {
  private readonly logger = new Logger(CloudinaryFileStorageService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly fileCompressionService: FileCompressionService
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
    this.logger.log('Cloudinary configured successfully');
  }

  /**
   * Upload a file with aggressive local compression
   */
  async uploadFile(
    file: Express.Multer.File,
    options?: UploadOptions
  ): Promise<UploadResult> {
    try {
      let processedBuffer = file.buffer;
      let processedMimetype = file.mimetype;
      const originalSize = file.buffer.length;

      this.logger.log(
        `Starting upload for ${file.originalname} (${originalSize} bytes, ${file.mimetype})`
      );

      // Apply aggressive local compression
      if (file.mimetype.startsWith('image/')) {
        this.logger.debug(`Applying maximum image compression...`);
        processedBuffer = await this.fileCompressionService.compressImage(
          file.buffer
        );
        processedMimetype = 'image/webp';
      } else if (file.mimetype === 'application/pdf') {
        this.logger.debug(
          `Applying maximum PDF compression with Ghostscript...`
        );
        processedBuffer = await this.fileCompressionService.compressPDF(
          file.buffer
        );
      }

      const localCompressionRatio = (
        ((originalSize - processedBuffer.length) / originalSize) *
        100
      ).toFixed(2);
      this.logger.log(
        `Local compression: ${originalSize} → ${processedBuffer.length} bytes (${localCompressionRatio}% reduction)`
      );

      // Determine resource type
      const isImageOrPdf =
        processedMimetype.startsWith('image/') ||
        processedMimetype === 'application/pdf';
      const resourceType =
        options?.resourceType || (isImageOrPdf ? 'image' : 'auto');

      // Upload options
      const uploadOptions: any = {
        folder:
          options?.folder ||
          this.configService.get<string>('CLOUDINARY_UPLOAD_FOLDER', 'quizzer'),
        resource_type: resourceType,
        type: 'upload',
        access_mode: 'public',
        invalidate: true,
        public_id: options?.publicId,
        overwrite: options?.overwrite ?? false,
        tags: options?.tags,
        use_filename: false,
        unique_filename: !options?.publicId,
      };

      if (resourceType === 'image') {
        uploadOptions.quality = 'auto:good';
        uploadOptions.fetch_format = 'auto';
      }

      this.logger.debug(
        `Uploading to Cloudinary: ${file.originalname} (${processedBuffer.length} bytes)`
      );

      // Upload to Cloudinary
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error((error as any).message || JSON.stringify(error))
              );
            } else {
              resolve(result);
            }
          }
        );
        uploadStream.end(processedBuffer);
      });

      const finalCompressionRatio = (
        ((originalSize - result.bytes) / originalSize) *
        100
      ).toFixed(2);
      this.logger.log(`Upload successful: ${result.public_id}`);
      this.logger.log(
        `Final size: ${result.bytes} bytes (${finalCompressionRatio}% total reduction from ${originalSize} bytes)`
      );

      return {
        publicId: result.public_id,
        url: result.url,
        secureUrl: result.secure_url,
        format: result.format,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        resourceType: result.resource_type,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  async deleteFile(publicId: string): Promise<void> {
    try {
      this.logger.debug(`Deleting file: ${publicId}`);
      const result = await cloudinary.uploader.destroy(publicId, {
        invalidate: true,
      });

      if (result.result === 'ok' || result.result === 'not found') {
        this.logger.log(`File deleted successfully: ${publicId}`);
      } else {
        this.logger.warn(
          `Unexpected delete result for ${publicId}: ${result.result}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete file ${publicId}: ${error.message}`,
        error.stack
      );
    }
  }

  getFileUrl(publicId: string, options?: TransformOptions): string {
    try {
      const transformation: any = {
        quality: options?.quality || 'auto:good',
        fetch_format: options?.format || 'auto',
      };

      if (options) {
        if (options.width) transformation.width = options.width;
        if (options.height) transformation.height = options.height;
        if (options.crop) transformation.crop = options.crop;
        if (options.gravity) transformation.gravity = options.gravity;
      }

      const url = cloudinary.url(publicId, {
        secure: true,
        type: 'upload',
        resource_type: 'auto',
        transformation: transformation,
      });

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate URL for ${publicId}: ${error.message}`
      );
      throw new Error(`URL generation failed: ${error.message}`);
    }
  }
}
