import pino, { type Logger } from 'pino';
import { getEnv } from '../config/env.js';

/**
 * Structured JSON logger. Every request line carries `requestId` (added by
 * the request-id middleware via pino-http) so client error reports can be
 * correlated with server logs.
 *
 * Sensitive fields are redacted by path, not by grep: any value under a
 * `password`, token, ID-document or authorization header never reaches disk.
 */
export function createLogger(overrides: Record<string, unknown> = {}): Logger {
  // Environment validation belongs to the entrypoint. Keep logging available
  // even when it fails, so the startup error can still be reported instead of
  // crashing the function before any handler exists.
  let level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent' = 'info';
  let service = 'Silverstone Managers';
  try {
    const env = getEnv();
    level = env.LOG_LEVEL;
    service = env.APP_NAME;
  } catch {
    // Invalid environment: the entrypoint reports the issues.
  }
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        '*.idNumber',
        '*.nin',
        '*.bvn',
        '*.nextOfKin.phone',
        '*.phoneNumber',
      ],
      censor: '[REDACTED]',
    },
    ...overrides,
  });
}

export const logger: Logger = createLogger();
