/**
 * Error model for the API.
 *
 * - `AppError` instances are *operational*: expected, safe to show to the
 *   client with a stable code and a friendly message.
 * - Everything else is *programmatic*: logged in full, returned to the client
 *   as an opaque internal error so stack traces and query details never leak.
 */
import type { ErrorCode, FieldError } from '@silverstone/shared';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: FieldError[];
  readonly cause?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options?: { details?: FieldError[]; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;
  }

  toBody(requestId: string) {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId,
        ...(this.details && this.details.length > 0 ? { details: this.details } : {}),
      },
    };
  }
}

/** 400 with structured field errors, typically from Zod validation. */
export class ValidationError extends AppError {
  constructor(details: FieldError[]) {
    super(400, 'VALIDATION_ERROR', 'Request validation failed', { details });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super(503, 'DATABASE_UNAVAILABLE', 'The database is not available', { cause });
    this.name = 'DatabaseUnavailableError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (isAppError(error) && error.code === 'DATABASE_UNAVAILABLE') return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name?.startsWith('PrismaClient')
  );
}
