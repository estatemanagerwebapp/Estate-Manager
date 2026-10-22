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
    // Log the real cause server-side; the client only gets a stable code.
    logger.error({ err, requestId }, 'database request failed');
    const error = new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is not available');
    res.status(error.statusCode).json(error.toBody(requestId));
    return;
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

function isStatusError(err: Error): boolean {
  return typeof (err as { status?: unknown }).status === 'number';
}
