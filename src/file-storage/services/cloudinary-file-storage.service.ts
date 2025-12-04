import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";
import {
  IFileStorageService,
  UploadOptions,
  UploadResult,
  TransformOptions,
} from "../interfaces/file-storage.interface";

/**
 * Cloudinary implementation of the file storage service
 * This can be easily swapped with S3, DigitalOcean, or any other provider
 */
@Injectable()
export class CloudinaryFileStorageService implements IFileStorageService {
  private readonly logger = new Logger(CloudinaryFileStorageService.name);

  constructor(private readonly configService: ConfigService) {
    // Configure Cloudinary with environment variables
    cloudinary.config({
      cloud_name: this.configService.get<string>("CLOUDINARY_CLOUD_NAME"),
      api_key: this.configService.get<string>("CLOUDINARY_API_KEY"),
      api_secret: this.configService.get<string>("CLOUDINARY_API_SECRET"),
      secure: true, // Always use HTTPS
    });

    this.logger.log("Cloudinary configured successfully");
  }

  /**
   * Upload a file to Cloudinary with public access
   */
  async uploadFile(
    file: Express.Multer.File,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    try {
      const uploadOptions = {
        folder:
          options?.folder ||
          this.configService.get<string>("CLOUDINARY_UPLOAD_FOLDER", "quizzer"),
        resource_type: options?.resourceType || "auto",
        type: "upload", // Use 'upload' type for publicly accessible URLs
        access_mode: "public", // Explicitly set public access
        invalidate: true, // Invalidate CDN cache if updating existing file
        public_id: options?.publicId,
        overwrite: options?.overwrite ?? false,
        tags: options?.tags,
        // Additional settings to ensure public access
        use_filename: false,
        unique_filename: !options?.publicId, // Only use unique filename if publicId not provided
      };

      this.logger.debug(
        `Uploading file: ${file.originalname} to folder: ${uploadOptions.folder} with public access`,
      );

      // Upload to Cloudinary using buffer
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions as any,
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          },
        );

        uploadStream.end(file.buffer);
      });

      this.logger.log(
        `File uploaded successfully: ${result.public_id} - URL: ${result.secure_url}`,
      );

      // Return the secure URL which should be publicly accessible
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

  /**
   * Delete a file from Cloudinary
   */
  async deleteFile(publicId: string): Promise<void> {
    try {
      this.logger.debug(`Deleting file: ${publicId}`);

      const result = await cloudinary.uploader.destroy(publicId, {
        invalidate: true, // Invalidate CDN cache
      });

      if (result.result === "ok" || result.result === "not found") {
        this.logger.log(`File deleted successfully: ${publicId}`);
      } else {
        this.logger.warn(
          `Unexpected delete result for ${publicId}: ${result.result}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete file ${publicId}: ${error.message}`,
        error.stack,
      );
      // Don't throw error for delete failures - log and continue
      // This prevents cascading failures when cleaning up
    }
  }

  /**
   * Get the URL of a file with optional transformations
   * Always returns public, secure URLs
   */
  getFileUrl(publicId: string, options?: TransformOptions): string {
    try {
      const transformation: any = {};

      if (options) {
        if (options.width) transformation.width = options.width;
        if (options.height) transformation.height = options.height;
        if (options.crop) transformation.crop = options.crop;
        if (options.quality) transformation.quality = options.quality;
        if (options.format) transformation.fetch_format = options.format;
        if (options.gravity) transformation.gravity = options.gravity;
      }

      const url = cloudinary.url(publicId, {
        secure: true, // Always use HTTPS
        type: "upload", // Use 'upload' type for public access
        resource_type: "auto",
        transformation:
          Object.keys(transformation).length > 0 ? transformation : undefined,
      });

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate URL for ${publicId}: ${error.message}`,
      );
      throw new Error(`URL generation failed: ${error.message}`);
    }
  }
}
