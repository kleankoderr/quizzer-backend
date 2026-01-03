import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import {
  IFileStorageService,
  UploadOptions,
  UploadResult,
  TransformOptions,
} from '../interfaces/file-storage.interface';

/**
 * Cloudinary implementation with aggressive compression via FileCompressionService
 */
@Injectable()
export class CloudinaryFileStorageService implements IFileStorageService {
  private readonly logger = new Logger(CloudinaryFileStorageService.name);

  constructor(private readonly configService: ConfigService) {
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
      const fileSize = file.buffer.length;

      this.logger.log(
        `Starting upload for ${file.originalname} (${fileSize} bytes, ${file.mimetype})`
      );

      // Determine resource type
      const isImageOrPdf =
        file.mimetype.startsWith('image/') ||
        file.mimetype === 'application/pdf';
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
        `Uploading to Cloudinary: ${file.originalname} (${file.buffer.length} bytes)`
      );

      // Upload to Cloudinary
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : (error as any).message || JSON.stringify(error);
              reject(new Error(`Cloudinary upload failed: ${errorMessage}`));
            } else {
              resolve(result);
            }
          }
        );
        uploadStream.end(file.buffer);
      });

      this.logger.log(`Upload successful: ${result.public_id}`);
      this.logger.log(`Uploaded ${file.originalname}: ${result.bytes} bytes`);

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
