import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { createRateLimitedResponse } from '../lib/rate-limit-response.js';

/**
 * Builds the API-wide rate limiter (per-process store; shared-storage
 * backends come with horizontal scaling).
 *
 * Health probes are exempt so orchestration and diagnostics are never
 * throttled. Per-route limiters for sensitive endpoints (invitation-code
 * verification, payment callbacks) are introduced in the phases that
 * implement those endpoints.
 */
export function createRateLimiter(
  env: Env,
  options: Partial<Options> = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.method === 'GET' &&
      (req.path === `${env.API_BASE_PATH}/health` ||
        req.path === `${env.API_BASE_PATH}/health/live` ||
        req.path === `${env.API_BASE_PATH}/health/ready`),
    // The default `skipSuccessfulRequests` is true in v8, so by default the
    // counter would never observe a 429 (it is skipped as a "failed" request
    // whose close fires first). Skip neither; counts stay consistent.
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    handler: (_req, res) => {
      createRateLimitedResponse(res);
    },
    ...options,
  });
}
