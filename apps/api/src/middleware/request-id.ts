import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { pinoHttp, type Options } from 'pino-http';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function requestIdFor(req: IncomingMessage | Request): string {
  const incoming = req.headers['x-request-id'];
  const provided = Array.isArray(incoming) ? incoming[0] : incoming;
  if (provided && VALID_REQUEST_ID.test(provided)) {
    return provided;
  }
  return randomUUID();
}

/**
 * Assigns every request an id (client supplied or generated) and attaches it
 * to the response and to log lines. The id is the only correlation handle
 * that is safe to return to the client in error responses.
 *
 * The id is written to the response header immediately, *before* the request
 * handlers run, so even a 404/429 that never reaches a router can be
 * correlated with its log lines.
 */
export function requestIdMiddleware() {
  const httpLogging = pinoHttp({
    logger,
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = requestIdFor(req);
      res.setHeader('x-request-id', id);
      return id;
    },
    customProps: (req: IncomingMessage, res: ServerResponse) => {
      // pino-http exposes the id it generated via the response header, so
      // read it back instead of re-deriving (and possibly diverging).
      const value = res.getHeader('x-request-id');
      const flat = Array.isArray(value) ? value[0] : value;
      return { requestId: (typeof flat === 'string' ? flat : undefined) ?? requestIdFor(req) };
    },
    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const env = getEnv();
        return (
          env.NODE_ENV === 'test' &&
          req.method === 'GET' &&
          (req.url?.startsWith('/health') || req.url?.startsWith('/health/'))
        );
      },
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  } as Options);

  return (req: Request, res: Response, next: NextFunction) => {
    httpLogging(req, res, next);
  };
}
