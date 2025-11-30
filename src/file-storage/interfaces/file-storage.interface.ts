/**
 * Generic file storage interface
 * Allows easy swapping between different storage providers (Cloudinary, S3, etc.)
 */
export interface IFileStorageService {
  /**
   * Upload a file to storage
   * @param file - The file to upload
   * @param options - Upload options (folder, transformations, etc.)
   * @returns Upload result with file URL and metadata
   */
  uploadFile(
    file: Express.Multer.File,
    options?: UploadOptions
  ): Promise<UploadResult>;

  /**
   * Delete a file from storage
   * @param publicId - The unique identifier of the file
   */
  deleteFile(publicId: string): Promise<void>;

  /**
   * Get the URL of a stored file
   * @param publicId - The unique identifier of the file
   * @param options - Transformation options (resize, format, etc.)
   * @returns The file URL
   */
  getFileUrl(publicId: string, options?: TransformOptions): string;
}

/**
 * Options for uploading files
 */
export interface UploadOptions {
  /** Folder path in storage */
  folder?: string;
  /** Resource type (image, video, raw, auto) */
  resourceType?: "image" | "video" | "raw" | "auto";
  /** Public ID (filename) to use */
  publicId?: string;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** Tags to apply to the file */
  tags?: string[];
}

/**
 * Result of a file upload
 */
export interface UploadResult {
  /** Unique identifier for the file */
  publicId: string;
  /** HTTP URL of the file */
  url: string;
  /** HTTPS URL of the file */
  secureUrl: string;
  /** File format/extension */
  format: string;
  /** File size in bytes */
  bytes: number;
  /** Width (for images/videos) */
  width?: number;
  /** Height (for images/videos) */
  height?: number;
  /** Resource type */
  resourceType: string;
}

/**
 * Options for transforming files (mainly for images)
 */
export interface TransformOptions {
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Crop mode */
  crop?: "scale" | "fit" | "fill" | "thumb" | "crop";
  /** Quality (1-100) */
  quality?: number;
  /** Format to convert to */
  format?: string;
  /** Gravity for cropping */
  gravity?: "auto" | "face" | "center" | "north" | "south" | "east" | "west";
}

/**
 * Provider token for dependency injection
 */
export const FILE_STORAGE_SERVICE = "FILE_STORAGE_SERVICE";
