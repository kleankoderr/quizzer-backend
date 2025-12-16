/**
 * Pagination metadata for paginated API responses
 */
export interface PaginationMeta {
  pageSize: number;
  pageNumber: number;
  totalPages: number;
  total: number;
}

/**
 * Unified API response structure
 * @template T - Type of the data payload
 */
export interface ApiResponse<T = any> {
  message: string;
  status: number;
  error: string | Record<string, any> | null;
  data: T | null;
  pagination?: PaginationMeta;
}

/**
 * Create a successful API response
 * @param data - The data payload
 * @param message - Optional success message
 * @param status - HTTP status code (default: 200)
 */
export function createSuccessResponse<T>(
  data: T,
  message: string = 'Success',
  status: number = 200
): ApiResponse<T> {
  return {
    message,
    status,
    error: null,
    data,
  };
}

/**
 * Create a paginated API response
 * @param data - The data payload (array)
 * @param pagination - Pagination metadata
 * @param message - Optional success message
 * @param status - HTTP status code (default: 200)
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  message: string = 'Success',
  status: number = 200
): ApiResponse<T[]> {
  return {
    message,
    status,
    error: null,
    data,
    pagination,
  };
}

/**
 * Create an error API response
 * @param error - Error message or validation errors object
 * @param message - Error message
 * @param status - HTTP status code (default: 500)
 */
export function createErrorResponse(
  error: string | Record<string, any>,
  message: string = 'An error occurred',
  status: number = 500
): ApiResponse<null> {
  return {
    message,
    status,
    error,
    data: null,
  };
}
