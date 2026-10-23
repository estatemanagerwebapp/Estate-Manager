import type { Env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  ConsoleEmailAdapter,
  MockEmailAdapter,
  ResendEmailAdapter,
  type EmailAdapter,
} from './email-adapter.js';

/**
 * Builds the configured email adapter from the validated environment.
 *
 * - `console` — logs captured messages to the server log (no real delivery).
 * - `resend` — posts to the Resend HTTP API. Requires `RESEND_API_KEY`.
 * - `mock` — records what would have been sent. Intended for tests only;
 *   never select it in a real deployment.
 *
 * Provider credentials come only from validated environment variables and
 * are never returned by any API route or written to a log file.
 */
export function createEmailAdapter(env: Env): EmailAdapter {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      if (!env.RESEND_API_KEY) {
        // The Zod superRefine already rejects this combination, so this is a
        // defensive guard for callers that bypass `parseEnv`.
        throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY');
      }
      return new ResendEmailAdapter(env.RESEND_API_KEY, env.EMAIL_FROM, logger);

    case 'mock':
      return new MockEmailAdapter();

    case 'console':
    default:
      return new ConsoleEmailAdapter(logger);
  }
}
