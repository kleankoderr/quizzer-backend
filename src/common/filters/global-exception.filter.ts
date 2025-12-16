import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { createErrorResponse } from '../dto/api-response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract error details
    let errorMessage = 'An error occurred';
    let errorDetails: string | Record<string, any> = 'Internal server error';

    if (exception instanceof ThrottlerException) {
      errorMessage =
        'You have exceeded the rate limit for this action. Please, try again later.';
    } else if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      // Handle validation errors (BadRequestException with validation details)
      if (
        exception instanceof BadRequestException &&
        typeof exceptionResponse === 'object'
      ) {
        const response = exceptionResponse as any;

        if (response.message && Array.isArray(response.message)) {
          // Validation errors from class-validator
          errorMessage = 'Validation failed';
          errorDetails = this.formatValidationErrors(response.message);
        } else if (response.message) {
          errorMessage = Array.isArray(response.message)
            ? response.message[0]
            : response.message;
          errorDetails = response.message;
        } else {
          errorMessage = exception.message;
          errorDetails = exception.message;
        }
      } else if (typeof exceptionResponse === 'string') {
        errorMessage = exceptionResponse;
        errorDetails = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const response = exceptionResponse as any;
        errorMessage = response.message || exception.message;
        errorDetails = response.message || exception.message;
      } else {
        errorMessage = exception.message;
        errorDetails = exception.message;
      }
    } else if (exception instanceof Error) {
      errorMessage = exception.message;
      errorDetails = exception.message;
    }

    // Log the error appropriately
    if (httpStatus >= 500) {
      this.logger.error(exception);
    } else {
      this.logger.warn(exception);
    }

    // Create unified error response
    const responseBody = createErrorResponse(
      errorDetails,
      errorMessage,
      httpStatus
    );

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }

  /**
   * Format validation errors into a structured object
   */
  private formatValidationErrors(messages: string[]): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    for (const message of messages) {
      // Try to extract field name from validation message
      // Format: "field should not be empty" or "field must be a string"
      const match = message.match(/^(\w+)\s/);
      const field = match ? match[1] : 'general';

      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(message);
    }

    return errors;
  }
}
