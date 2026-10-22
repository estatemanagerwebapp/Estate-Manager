import type { Request, Response } from 'express';

/**
 * Standard body for a 429 raised by the global rate limiter. The
 * `Retry-After` header is emitted by `express-rate-limit` (standardHeaders),
 * so this function owns only the JSON envelope.
 */
export function createRateLimitedResponse(req: Request, res: Response): void {
  const requestId = res.header('x-request-id') ?? 'unknown';
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Retry after the indicated delay.',
      requestId,
    },
  });
}
