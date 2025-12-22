import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

@Injectable()
export class FileCompressionService implements OnModuleInit {
  private readonly logger = new Logger(FileCompressionService.name);
  private ghostscriptAvailable: boolean = false;

  constructor() {}

  async onModuleInit() {
    await this.checkGhostscript();
  }

  /**
   * Check if Ghostscript is available
   */
  private async checkGhostscript(): Promise<void> {
    try {
      await execFileAsync('gs', ['--version']);
      this.ghostscriptAvailable = true;
      this.logger.log('Ghostscript detected - PDF compression enabled');
    } catch (error) {
      this.ghostscriptAvailable = false;
      this.logger.warn(
        `Ghostscript check failed: ${
          error instanceof Error ? error.message : String(error)
        }. PDF compression will be limited.`
      );
    }
  }

  /**
   * Compress image using Sharp with maximum compression
   */
  async compressImage(buffer: Buffer): Promise<Buffer> {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      this.logger.debug(
        `Original image: ${metadata.format}, ${metadata.width}x${metadata.height}, ${buffer.length} bytes`
      );

      let processedImage = image;

      // Resize large images
      if (metadata.width && metadata.width > 1920) {
        processedImage = processedImage.resize(1920, null, {
          fit: 'inside',
          kernel: 'lanczos3',
        });
      }

      // Convert to WebP with aggressive compression
      const compressed = await processedImage
        .webp({
          quality: 50,
          effort: 6,
          smartSubsample: true,
          nearLossless: false,
          alphaQuality: 50,
        })
        .toBuffer();

      const compressionRatio = (
        ((buffer.length - compressed.length) / buffer.length) *
        100
      ).toFixed(2);
      this.logger.log(
        `Image compressed: ${buffer.length} → ${compressed.length} bytes (${compressionRatio}% reduction)`
      );

      return compressed;
    } catch (error) {
      this.logger.error(`Image compression failed: ${error.message}`);
      return buffer;
    }
  }

  /**
   * Compress PDF using Ghostscript with ULTRA-AGGRESSIVE compression
   * Target: 50-80% reduction minimum
   */
  async compressPDF(buffer: Buffer): Promise<Buffer> {
    if (!this.ghostscriptAvailable) {
      this.logger.warn('Ghostscript unavailable - skipping PDF compression');
      return buffer;
    }

    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input-${Date.now()}.pdf`);
    const outputPath = path.join(tempDir, `output-${Date.now()}.pdf`);

    try {
      const originalSize = buffer.length;
      this.logger.debug(
        `Compressing PDF with ultra-aggressive settings: ${originalSize} bytes`
      );

      // Write input file
      await fs.writeFile(inputPath, buffer);

      // ULTRA-AGGRESSIVE COMPRESSION - Minimum 50% reduction
      const gsArgs = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/screen', // Most aggressive preset
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',

        // Core compression
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
        '-dOptimize=true',
        '-dEmbedAllFonts=true',

        // ULTRA-LOW RESOLUTION - 36 DPI (very aggressive)
        '-dDownsampleColorImages=true',
        '-dDownsampleGrayImages=true',
        '-dDownsampleMonoImages=true',
        '-dColorImageDownsampleType=/Bicubic',
        '-dGrayImageDownsampleType=/Bicubic',
        '-dMonoImageDownsampleType=/Bicubic',
        '-dColorImageResolution=50', // Extremely low (was 72)
        '-dGrayImageResolution=50', // Extremely low (was 72)
        '-dMonoImageResolution=50', // Extremely low (was 72)

        // Force downsampling
        '-dColorImageDownsampleThreshold=1.0',
        '-dGrayImageDownsampleThreshold=1.0',
        '-dMonoImageDownsampleThreshold=1.0',

        // Maximum JPEG compression
        '-dAutoFilterColorImages=false',
        '-dColorImageFilter=/DCTEncode',
        '-dAutoFilterGrayImages=false',
        '-dGrayImageFilter=/DCTEncode',
        '-dMonoImageFilter=/CCITTFaxEncode',

        // Additional aggressive settings
        '-dFastWebView=true',
        '-dPrinted=false',
        '-dUseFlateCompression=true',
        '-dConvertCMYKImagesToRGB=true', // Reduce color space

        // Remove unnecessary data
        '-dDoThumbnails=false',
        '-dCreateJobTicket=false',
        '-dPreserveEPSInfo=false',
        '-dPreserveOPIComments=false',
        '-dPreserveOverprintSettings=false',
        '-dUCRandBGInfo=/Remove',

        `-sOutputFile=${outputPath}`,
        inputPath,
      ];

      this.logger.debug(`Executing ultra-aggressive Ghostscript compression`);

      // Execute Ghostscript
      await execFileAsync('gs', gsArgs, {
        maxBuffer: 50 * 1024 * 1024,
      });

      // Read compressed file
      const compressed = await fs.readFile(outputPath);

      const compressionRatio = (
        ((originalSize - compressed.length) / originalSize) *
        100
      ).toFixed(2);

      this.logger.log(
        `PDF compressed: ${originalSize} → ${compressed.length} bytes (${compressionRatio}% reduction)`
      );

      // If still not 50%, log a warning
      if (Number.parseFloat(compressionRatio) < 50) {
        this.logger.warn(
          `Compression only achieved ${compressionRatio}%. PDF may already be heavily compressed or contain mostly text.`
        );
      }

      // Clean up temp files
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});

      return compressed;
    } catch (error) {
      this.logger.error(`PDF compression failed: ${error.message}`);

      // Clean up temp files
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});

      return buffer;
    }
  }
}
