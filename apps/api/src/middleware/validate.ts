import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Validates `req.body` (and optionally `req.query`) against Zod schemas.
 * Parsed and coerced values replace the originals on `req`, so handlers
 * receive typed input. Failures become a 400 `VALIDATION_ERROR` with the
 * per-field issues attached.
 *
 * Phase 1+ replaces this with parameterised per-route schemas; the mechanism
 * is already in place so route handlers stay free of validation code.
 */
export function validate(schema: { body?: ZodTypeAny; query?: ZodTypeAny }): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const details: Array<{ path: string; message: string }> = [];

    if (schema.body) {
      const body = schema.body.safeParse(req.body ?? {});
      if (!body.success) {
        for (const issue of body.error.issues) {
          details.push({
            path: `body.${issue.path.join('.')}`,
            message: issue.message,
          });
        }
      } else {
        req.body = body.data;
      }
    }

    if (schema.query) {
      const query = schema.query.safeParse(req.query);
      if (!query.success) {
        for (const issue of query.error.issues) {
          details.push({
            path: `query.${issue.path.join('.')}`,
            message: issue.message,
          });
        }
      }
      // Express 5 makes req.query read-only; validated query is exposed on
      // the response scope instead of mutably rewriting the request.
      res.locals.query = query.success ? query.data : undefined;
    }

    if (details.length > 0) {
      next(new ValidationError(details));
      return;
    }
    next();
  };
}

export { z };
