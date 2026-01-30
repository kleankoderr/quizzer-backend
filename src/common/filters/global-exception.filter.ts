import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { createErrorResponse } from '../dto/api-response.dto';

/**
 * Global exception filter that catches all unhandled exceptions
 * and formats them into a consistent API response structure.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const errorContext = this.extractErrorContext(exception);
    this.logError(exception, errorContext.status);

    const responseBody = createErrorResponse(
      errorContext.details,
      errorContext.message,
      errorContext.status
    );

    httpAdapter.reply(ctx.getResponse(), responseBody, errorContext.status);
  }

  /**
   * Extracts error context including status, message, and details
   */
  private extractErrorContext(exception: unknown): ErrorContext {
    // Handle rate limiting errors
    if (exception instanceof ThrottlerException) {
      return this.handleThrottlerException(exception);
    }

    // Handle HTTP exceptions (including validation errors)
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception);
    }

    // Handle database errors
    if (this.isDatabaseError(exception)) {
      return this.handleDatabaseError(exception);
    }

    // Handle generic errors
    if (exception instanceof Error) {
      return this.handleGenericError(exception);
    }

    // Handle unknown errors
    return this.handleUnknownError();
  }

  /**
   * Handles ThrottlerException (rate limiting)
   */
  private handleThrottlerException(
    exception: ThrottlerException
  ): ErrorContext {
    return {
      status: exception.getStatus(),
      message: 'Too many requests. Please try again later.',
      details: 'You have exceeded the rate limit for this action.',
    };
  }

  /**
   * Handles all HTTP exceptions including validation errors
   */
  private handleHttpException(exception: HttpException): ErrorContext {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Handle BadRequestException with validation errors
    if (exception instanceof BadRequestException) {
      return this.handleValidationError(exceptionResponse, status);
    }

    // Handle other HTTP exceptions
    return this.parseHttpExceptionResponse(
      exceptionResponse,
      exception,
      status
    );
  }

  /**
   * Handles validation errors from class-validator
   */
  private handleValidationError(
    response: string | object,
    status: number
  ): ErrorContext {
    if (typeof response !== 'object') {
      return {
        status,
        message: 'Validation failed',
        details: response,
      };
    }

    const responseObj = response as any;

    // Check if it's a class-validator error with array of messages
    if (Array.isArray(responseObj.message)) {
      return {
        status,
        message: 'Validation failed',
        details: this.formatValidationErrors(responseObj.message),
      };
    }

    return {
      status,
      message: responseObj.message || 'Validation failed',
      details: responseObj.message || responseObj.error || 'Invalid input',
    };
  }

  /**
   * Parses HTTP exception response into error context
   */
  private parseHttpExceptionResponse(
    response: string | object,
    exception: HttpException,
    status: number
  ): ErrorContext {
    if (typeof response === 'string') {
      return {
        status,
        message: sanitizeErrorMessage(response),
        details: response,
      };
    }

    const responseObj = response as any;
    const rawMessage = responseObj.message || exception.message;
    const sanitizedMessage = sanitizeErrorMessage(rawMessage);

    return {
      status,
      message: sanitizedMessage,
      details: responseObj.error || responseObj.message || exception.message,
    };
  }

  /**
   * Handles database-related errors (TypeORM)
   */
  private handleDatabaseError(exception: any): ErrorContext {
    this.logger.error('Database error occurred', exception);

    // Don't expose database details to users
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'A database error occurred. Please try again later.',
      details: 'Database operation failed',
    };
  }

  /**
   * Handles generic JavaScript errors
   */
  private handleGenericError(exception: Error): ErrorContext {
    const sanitizedMessage = createFriendlyErrorMessage(
      exception.message,
      exception.name === 'Error' ? undefined : exception.name
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: sanitizedMessage,
      details: exception.message,
    };
  }

  /**
   * Handles completely unknown errors
   */
  private handleUnknownError(): ErrorContext {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred. Please try again.',
      details: 'Unknown error',
    };
  }

  /**
   * Checks if the exception is a database error
   */
  private isDatabaseError(exception: unknown): boolean {
    return (
      // Prisma errors have a code property starting with 'P'
      (exception as any)?.code?.startsWith('P') ||
      // Generic database error patterns
      (exception as any)?.name === 'PrismaClientKnownRequestError' ||
      (exception as any)?.name === 'PrismaClientValidationError' ||
      (exception as any)?.name === 'PrismaClientUnknownRequestError'
    );
  }

  /**
   * Formats validation errors into a structured object
   * Groups errors by field name for easier client-side handling
   */
  private formatValidationErrors(messages: string[]): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    for (const message of messages) {
      const field = this.extractFieldFromMessage(message);

      if (!errors[field]) {
        errors[field] = [];
      }

      errors[field].push(message);
    }

    return errors;
  }

  /**
   * Extracts field name from validation message
   * Example: "email must be a valid email" -> "email"
   */
  private extractFieldFromMessage(message: string): string {
    const match = new RegExp(/^(\w+)\s/).exec(message);
    return match ? match[1] : 'general';
  }

  /**
   * Logs error with appropriate level based on status code
   */
  private logError(exception: unknown, status: number): void {
    const shouldLogFull = shouldLogFullError(exception);

    const logContext = {
      status,
      exception: exception instanceof Error ? exception.message : exception,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      if (shouldLogFull) {
        this.logger.error('Server error occurred', exception);
      } else {
        this.logger.error('Server error occurred', logContext);
      }
    } else if (status >= HttpStatus.BAD_REQUEST) {
      this.logger.warn('Client error occurred', logContext);
    } else {
      this.logger.debug('Request processed with error', logContext);
    }
  }
}

/**
 * Interface for error context extraction
 */
interface ErrorContext {
  status: number;
  message: string;
  details: string | Record<string, any>;
}

const TECHNICAL_ERROR_PATTERNS = [
  // Authentication & API keys
  /API[_\s]?key/i,
  /authentication[_\s]?failed/i,
  /invalid[_\s]?credentials/i,
  /token[_\s]?expired/i,
  /unauthorized/i,
  // Technical API errors
  /INVALID_ARGUMENT/i,
  /API_KEY_INVALID/i,
  /googleapis\.com/i,
  /generativelanguage/i,
  // AI generation errors
  /AI[_\s]?generation[_\s]?failed/i,
  /GoogleGenerativeAI[_\s]?Error/i,
  /generativeai/i,
  /gemini[_\s]?api/i,
  // Database errors
  /SQL/i,
  /database/i,
  /query[_\s]?failed/i,
  /connection[_\s]?refused/i,
  /ECONNREFUSED/i,
  // Internal errors
  /stack[_\s]?trace/i,
  /internal[_\s]?server/i,
  /500/,
  // Network errors
  /ENOTFOUND/i,
  /ETIMEDOUT/i,
  /network[_\s]?error/i,
] as const;

/**
 * User-friendly error messages for different categories
 */
const FRIENDLY_ERROR_MESSAGES = {
  authentication:
    'Authentication failed. Please check your credentials and try again.',
  service:
    'We encountered an issue with our service. Please try again in a moment.',
  network:
    'Unable to connect to the service. Please check your internet connection.',
  validation: 'Please check your input and try again.',
  notFound: 'The requested resource was not found.',
  default: 'Something went wrong. Please try again.',
} as const;

/**
 * Sanitizes error messages for user-facing display.
 * Replaces technical errors with friendly, generic messages.
 *
 * @param error - Error object or message string
 * @returns User-friendly error message
 */
export function sanitizeErrorMessage(error: any): string {
  const errorMessage = extractErrorMessage(error);
  if (!errorMessage) {
    return FRIENDLY_ERROR_MESSAGES.default;
  }
  const errorCategory = categorizeError(errorMessage);
  if (errorCategory === 'safe') {
    return errorMessage;
  }
  return getFriendlyMessage(errorCategory);
}

/**
 * Extracts error message from various error formats
 */
function extractErrorMessage(error: any): string {
  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }
  // Handle error objects with various structures
  const message =
    error?.response?.data?.message ||
    error?.response?.message ||
    error?.message ||
    '';

  // Ensure we always return a string (message could be an array in validation errors)
  if (Array.isArray(message)) {
    return message.join(', ');
  }
  if (typeof message === 'object') {
    return JSON.stringify(message);
  }
  return String(message);
}

/**
 * Categorizes error based on its content
 */
function categorizeError(message: string): ErrorCategory {
  const lowerMessage = message.toLowerCase();
  // Check if it's a technical error that should be hidden
  if (isTechnicalError(message)) {
    // Determine specific category
    if (isAuthenticationError(lowerMessage)) {
      return 'authentication';
    }
    if (isNetworkError(lowerMessage)) {
      return 'network';
    }
    if (isDatabaseError(lowerMessage)) {
      return 'service';
    }
    return 'service';
  }
  // Check if it's already a user-friendly message
  if (isUserFriendlyMessage(message)) {
    return 'safe';
  }
  // Default to service error for unknown technical messages
  return 'service';
}

/**
 * Checks if error message contains technical details
 */
function isTechnicalError(message: string): boolean {
  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Checks if error is authentication-related
 */
function isAuthenticationError(message: string): boolean {
  const authPatterns = [
    'auth',
    'token',
    'credential',
    'api key',
    'unauthorized',
    'forbidden',
  ];
  return authPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Checks if error is network-related
 */
function isNetworkError(message: string): boolean {
  const networkPatterns = [
    'network',
    'connection',
    'timeout',
    'econnrefused',
    'enotfound',
  ];
  return networkPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Checks if error is database-related
 */
function isDatabaseError(message: string): boolean {
  const dbPatterns = ['sql', 'database', 'query', 'table', 'column'];
  return dbPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Checks if message is already user-friendly
 */
function isUserFriendlyMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  // Allowlist: Messages containing these phrases are considered friendly
  const friendlyPhrases = [
    'please try again',
    'temporarily unavailable',
    'try again later',
    'check your',
    'please check',
  ];

  if (friendlyPhrases.some((phrase) => lowerMessage.includes(phrase))) {
    return true;
  }

  const technicalIndicators = [
    'error:',
    'exception',
    'failed to',
    'cannot',
    'invalid',
    'missing',
    '{}',
    '[]',
    'null',
    'undefined',
  ];

  // If message contains technical indicators, it's not user-friendly
  if (
    technicalIndicators.some((indicator) => lowerMessage.includes(indicator))
  ) {
    return false;
  }

  // If message is reasonably short and doesn't contain technical terms, consider it friendly
  return message.length > 10 && message.length < 200;
}

/**
 * Gets friendly message for error category
 */
function getFriendlyMessage(category: ErrorCategory): string {
  return FRIENDLY_ERROR_MESSAGES[category];
}

/**
 * Creates a user-friendly error message with optional context
 *
 * @param baseMessage - Base error message
 * @param context - Optional context to include
 * @returns Formatted error message
 */
export function createFriendlyErrorMessage(
  baseMessage: string,
  context?: string
): string {
  const sanitized = sanitizeErrorMessage(baseMessage);
  if (context && isUserFriendlyMessage(context)) {
    return `${sanitized} ${context}`;
  }
  return sanitized;
}

/**
 * Checks if an error should be logged with full details
 */
export function shouldLogFullError(error: any): boolean {
  const message = extractErrorMessage(error);
  return isTechnicalError(message) || !isUserFriendlyMessage(message);
}

/**
 * Error category types
 */
type ErrorCategory =
  | 'authentication'
  | 'service'
  | 'network'
  | 'validation'
  | 'notFound'
  | 'safe';
