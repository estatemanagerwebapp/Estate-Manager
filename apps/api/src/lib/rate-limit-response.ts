import type { Response } from 'express';

/**
 * Standard body for a 429 raised by the global rate limiter. The
 * `Retry-After` header is emitted by `express-rate-limit` (standardHeaders),
 * so this function owns only the JSON envelope.
 */
export function createRateLimitedResponse(res: Response): void {
  // Read the id set by the request-id middleware; fall back to "unknown" if
  // the middleware did not run (e.g. the request never reached it).
  const raw = res.getHeader('x-request-id');
  const requestId = Array.isArray(raw) ? raw[0] : raw;
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Retry after the indicated delay.',
      requestId: typeof requestId === 'string' ? requestId : 'unknown',
    },
  });
}
