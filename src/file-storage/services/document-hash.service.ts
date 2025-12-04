import { createHash } from "crypto";
import { Injectable, Logger, Inject } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { PrismaService } from "../../prisma/prisma.service";

export interface DocumentMetadata {
  hash: string;
  cloudinaryUrl: string;
  cloudinaryId: string;
  googleFileUrl?: string;
  googleFileId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ProviderUrls {
  cloudinaryUrl: string;
  cloudinaryId: string;
  googleFileUrl?: string;
  googleFileId?: string;
}

@Injectable()
export class DocumentHashService {
  private readonly logger = new Logger(DocumentHashService.name);
  private readonly CACHE_PREFIX = "document:hash:";
  private readonly CACHE_TTL = 86400;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async calculateFileHash(buffer: Buffer): Promise<string> {
    return createHash("sha256").update(buffer).digest("hex");
  }

  async findDocumentByHash(hash: string): Promise<DocumentMetadata | null> {
    const cacheKey = `${this.CACHE_PREFIX}${hash}`;

    const cached = await this.cacheManager.get<DocumentMetadata>(cacheKey);
    if (cached) {
      this.logger.debug(
        `Cache hit for document hash: ${hash.substring(0, 8)}...`,
      );
      return cached;
    }

    const document = await this.prisma.document.findUnique({
      where: { hash },
    });

    if (document) {
      const metadata: DocumentMetadata = {
        hash: document.hash,
        cloudinaryUrl: document.cloudinaryUrl,
        cloudinaryId: document.cloudinaryId,
        googleFileUrl: document.googleFileUrl || undefined,
        googleFileId: document.googleFileId || undefined,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
      };

      await this.cacheManager.set(cacheKey, metadata, this.CACHE_TTL);
      this.logger.debug(
        `Document found and cached: ${hash.substring(0, 8)}...`,
      );
      return metadata;
    }

    return null;
  }

  async storeDocumentMetadata(
    hash: string,
    urls: ProviderUrls,
    file: Express.Multer.File,
  ): Promise<DocumentMetadata> {
    const document = await this.prisma.document.create({
      data: {
        hash,
        cloudinaryUrl: urls.cloudinaryUrl,
        cloudinaryId: urls.cloudinaryId,
        googleFileUrl: urls.googleFileUrl,
        googleFileId: urls.googleFileId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    const metadata: DocumentMetadata = {
      hash: document.hash,
      cloudinaryUrl: document.cloudinaryUrl,
      cloudinaryId: document.cloudinaryId,
      googleFileUrl: document.googleFileUrl || undefined,
      googleFileId: document.googleFileId || undefined,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    };

    const cacheKey = `${this.CACHE_PREFIX}${hash}`;
    await this.cacheManager.set(cacheKey, metadata, this.CACHE_TTL);

    this.logger.log(
      `Document metadata stored: ${file.originalname} (${hash.substring(0, 8)}...)`,
    );
    return metadata;
  }

  async deleteDocumentByHash(hash: string): Promise<void> {
    try {
      await this.prisma.document.delete({ where: { hash } });
      const cacheKey = `${this.CACHE_PREFIX}${hash}`;
      await this.cacheManager.del(cacheKey);
      this.logger.log(`Document deleted: ${hash.substring(0, 8)}...`);
    } catch (error) {
      this.logger.warn(`Failed to delete document ${hash}: ${error.message}`);
    }
  }
}
