import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApiResponse,
  createSuccessResponse,
  createPaginatedResponse,
} from '../dto/api-response.dto';

/**
 * Interceptor to transform all responses into the unified ApiResponse format
 */
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode || HttpStatus.OK;

        // Check if the response is already in ApiResponse format
        if (this.isApiResponse(data)) {
          return data;
        }

        // Check if it's a paginated response (has data and meta properties)
        if (this.isPaginatedResponse(data)) {
          const { data: items, meta } = data;
          const pagination = {
            pageSize: meta.limit,
            pageNumber: meta.page,
            totalPages: meta.totalPages,
            total: meta.total,
          };

          return createPaginatedResponse(
            items,
            pagination,
            'Successful',
            statusCode
          );
        }

        // Standard non-paginated response
        return createSuccessResponse(data, 'Successful', statusCode);
      })
    );
  }

  /**
   * Check if the data is already in ApiResponse format
   */
  private isApiResponse(data: any): data is ApiResponse<T> {
    return (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      'status' in data &&
      'error' in data &&
      'data' in data
    );
  }

  /**
   * Check if the response is paginated (has data and meta properties)
   */
  private isPaginatedResponse(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      'data' in data &&
      'meta' in data &&
      Array.isArray(data.data) &&
      data.meta &&
      typeof data.meta === 'object' &&
      'page' in data.meta &&
      'limit' in data.meta &&
      'totalPages' in data.meta &&
      'total' in data.meta
    );
  }
}
