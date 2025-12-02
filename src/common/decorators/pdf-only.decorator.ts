import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from "@nestjs/common";
import { Observable } from "rxjs";

export interface PdfOnlyOptions {
  maxFiles?: number;
  maxSizePerFile?: number;
}

export function PdfOnly(options: PdfOnlyOptions = {}) {
  const maxFiles = options.maxFiles || 5;
  const maxSizePerFile = options.maxSizePerFile || 5 * 1024 * 1024;

  @Injectable()
  class PdfOnlyInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const request = context.switchToHttp().getRequest();
      const files = request.files || (request.file ? [request.file] : []);

      if (files.length === 0) {
        return next.handle();
      }

      if (files.length > maxFiles) {
        throw new BadRequestException(
          `Maximum ${maxFiles} file${maxFiles > 1 ? "s" : ""} allowed`
        );
      }

      for (const file of files) {
        if (file.mimetype !== "application/pdf") {
          throw new BadRequestException(
            `Only PDF files are allowed. Received: ${file.mimetype}`
          );
        }

        if (!file.originalname.toLowerCase().endsWith(".pdf")) {
          throw new BadRequestException(
            `Only PDF files are allowed. File: ${file.originalname}`
          );
        }

        if (file.size > maxSizePerFile) {
          const maxSizeMB = (maxSizePerFile / (1024 * 1024)).toFixed(1);
          const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
          throw new BadRequestException(
            `File size exceeds ${maxSizeMB}MB limit. File: ${file.originalname} (${fileSizeMB}MB)`
          );
        }
      }

      return next.handle();
    }
  }

  return PdfOnlyInterceptor;
}
