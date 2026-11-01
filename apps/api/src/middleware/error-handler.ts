/**
 * Centralized error middleware. Two handlers cover the error surface:
 *
 * - `notFoundHandler` — any path that fell through the routers → 404.
 * - `errorHandler` — the terminal handler that turns AppError / Zod errors /
 *   Prisma failures / anything unexpected into the standard envelope.
 */
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { ErrorCode } from '@silverstone/shared';
import { AppError, NotFoundError, ValidationError, isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function requestIdFor(res: Response): string {
  // Read the header set by the request-id middleware before the handler
  // runs; the getter/setter collision on `res.header` makes direct access
  // type-ambiguous, so go through the Node-level getter instead.
  const value = (
    res as unknown as { getHeader: (name: string) => string | string[] | undefined }
  ).getHeader('x-request-id');
  const flat = Array.isArray(value) ? value[0] : value;
  return typeof flat === 'string' ? flat : 'unknown';
}

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  const error = new NotFoundError(`No route for ${req.method} ${req.originalUrl}`);
  res.status(404).json(error.toBody(requestIdFor(res)));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    // Hand off to Node's default error handling; nothing useful left to do.
    _next(err);
    return;
  }

  const requestId = requestIdFor(res);

  if (isAppError(err)) {
    res.status(err.statusCode).json(err.toBody(requestId));
    return;
  }

  if (err instanceof ZodError) {
    const error = new ValidationError(
      err.issues.map((issue) => ({
        path: `body.${issue.path.join('.')}`,
        message: issue.message,
      })),
    );
    res.status(error.statusCode).json(error.toBody(requestId));
    return;
  }

  const bodyError = asBodyParserError(err);
  if (bodyError) {
    res.status(bodyError.status).json(bodyError.error.toBody(requestId));
    return;
  }

  if (isPrismaError(err)) {
    // Log the real cause server-side with the route; the client gets a stable
    // code plus the safe Prisma/PostgreSQL identifiers, never a stack trace or
    // connection string.
    logger.error(
      { err, requestId, method: req.method, path: req.originalUrl },
      'database request failed',
    );
    const description = describePrismaError(err);
    if (description) {
      logger.error(
        { requestId, prismaCode: prismaCodeOf(err), description },
        'database failure classified',
      );
      const error = new AppError(description.status, description.code, description.message);
      res.status(error.statusCode).json(error.toBody(requestId));
      return;
    }
  }

  const status =
    err instanceof Error && isStatusError(err)
      ? ((err as Error & { status?: unknown }).status as number)
      : 500;
  logger.error(
    { err, requestId, method: req.method, path: req.originalUrl },
    status === 500 ? 'unhandled error' : 'request error',
  );
  const error = new AppError(
    status,
    status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
    status === 500 ? 'An unexpected error occurred' : 'Bad request',
  );
  res.status(status).json(error.toBody(requestId));
}

function asBodyParserError(err: unknown): { status: number; error: AppError } | undefined {
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const { type } = err as { type?: string };
    if (type === 'entity.too.large') {
      return {
        status: 413,
        error: new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large'),
      };
    }
    if (type === 'entity.parse.failed') {
      return {
        status: 400,
        error: new AppError(400, 'BAD_REQUEST', 'The request body is not valid JSON'),
      };
    }
  }
  return undefined;
}

function isPrismaError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientUnknownRequestError
  );
}

function prismaCodeOf(err: unknown): string | null {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
}

export interface PrismaErrorDescription {
  status: number;
  code: ErrorCode;
  message: string;
}

/**
 * Translate a Prisma failure into a truthful client response.
 *
 * The old handler collapsed every database error into
 * `503 DATABASE_UNAVAILABLE / "The database is not available"`, which hid
 * schema drift. A missing enum value or column is now reported as
 * `SCHEMA_MIGRATION_REQUIRED` with the safe Prisma/PostgreSQL identifiers, while
 * genuine connectivity failures keep `DATABASE_UNAVAILABLE`.
 */
export function describePrismaError(err: unknown): PrismaErrorDescription | null {
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database is not available',
    };
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return {
      status: 503,
      code: 'DATABASE_ERROR',
      message: 'The database rejected the request',
    };
  }

  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  const pgCode = postgresCodeOf(err);

  switch (err.code) {
    case 'P2021':
    case 'P2022':
      return schemaError(err.code, pgCode);
    case 'P2010':
      // Raw-query failures carry the PostgreSQL code. Only the schema codes are
      // treated as drift; anything else is reported as a database error.
      return pgCode === '22P02' || pgCode === '42P01' || pgCode === '42703'
        ? schemaError(err.code, pgCode)
        : {
            status: 503,
            code: 'DATABASE_ERROR',
            message: `The database rejected the request (Prisma ${err.code}${pgCode ? ` / PostgreSQL ${pgCode}` : ''})`,
          };
    case 'P2002':
      return { status: 409, code: 'CONFLICT', message: 'A record with that value already exists' };
    case 'P2003':
    case 'P2014':
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'This record is still referenced by another record',
      };
    case 'P2025':
      return { status: 404, code: 'NOT_FOUND', message: 'The record was not found' };
    case 'P2028':
    case 'P2034':
      return {
        status: 503,
        code: 'DATABASE_BUSY',
        message: 'The database could not complete the operation in time; please retry',
      };
    case 'P2000':
    case 'P2011':
      return {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'A value is missing or too long for its field',
      };
    default:
      return {
        status: 503,
        code: 'DATABASE_ERROR',
        message: `The database request failed (Prisma ${err.code})`,
      };
  }
}

function schemaError(prismaCode: string, pgCode: string | null): PrismaErrorDescription {
  const identifiers = [`Prisma ${prismaCode}`, ...(pgCode ? [`PostgreSQL ${pgCode}`] : [])].join(
    ' / ',
  );
  return {
    status: 503,
    code: 'SCHEMA_MIGRATION_REQUIRED',
    message: `The database schema is out of date or missing a required value (${identifiers}). A pending migration must be applied before this action can succeed.`,
  };
}

function postgresCodeOf(err: Prisma.PrismaClientKnownRequestError): string | null {
  const meta = err.meta as { code?: unknown } | undefined;
  return typeof meta?.code === 'string' ? meta.code : null;
}

function isStatusError(err: Error): boolean {
  return typeof (err as { status?: unknown }).status === 'number';
}
