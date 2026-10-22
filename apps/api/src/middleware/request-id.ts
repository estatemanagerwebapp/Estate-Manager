import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Assigns every request an id (client supplied or generated) and attaches it
 * to the response and to log lines. The id is the only correlation handle
 * that is safe to return to the client in error responses.
 */
export function requestIdMiddleware() {
  const requestLogging = pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const provided = Array.isArray(incoming) ? incoming[0] : incoming;
      if (provided && VALID_REQUEST_ID.test(provided)) {
        return provided;
      }
      return randomUUID();
    },
    customProps: (req) => ({ requestId: (req as { id?: string }).id }),
    autoLogging: {
      ignore: (req) => getEnv().NODE_ENV === 'test' && req.method === 'GET' && req.url?.startsWith('/health'),
    },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });

  return (req: Request, res: Response, next: () => void) => {
    requestLogging(req, res, () => {
      res.setHeader('x-request-id', req.id);
      next();
    });
  };
}
