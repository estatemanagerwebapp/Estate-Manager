import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { SOS_STATUSES } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, auditContext } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorSosService } from './operator-sos.service.js';

export interface OperatorSosRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  sos: OperatorSosService;
}

/** Wrap async handlers so rejections reach the central error handler once. */
function asyncWrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      try {
        await handler(req, res, next);
      } catch (error) {
        if (!res.headersSent) next(error);
      }
    })();
  };
}

/**
 * Operator SOS routes, mounted at `/sos`.
 *
 * `GET /` is the staff queue and requires `sos.read`. Acknowledge/resolve
 * require `sos.manage`; the service enforces the RAISED → ACKNOWLEDGED →
 * RESOLVED lifecycle and records the acting operator.
 */
export function createOperatorSosRouter(options: OperatorSosRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, sos } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'sos.read'));
  const manageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'sos.manage'));

  function makeContext(req: Request, res: Response) {
    const ctx = auditContext(req, res);
    return {
      organizationId: ctx.organizationId ?? organizationId,
      actorId: ctx.actorId,
      requestId: ctx.requestId ?? null,
    };
  }

  function param(req: Request, name: string): string {
    const value = req.params[name];
    const flat = Array.isArray(value) ? value[0] : value;
    if (typeof flat !== 'string' || flat.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `Missing :${name} parameter`);
    }
    return flat;
  }

  function sosId(req: Request): string {
    const value = param(req, 'sosId');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid SOS alert id');
    }
    return value;
  }

  router.get(
    '/',
    authGuard,
    readGuard,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          status: z.enum(SOS_STATUSES).optional(),
          active: z.enum(['true', 'false']).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid SOS filter'));
        return;
      }

      const response = await sos.list(organizationId, {
        status: query.data.status,
        activeOnly: query.data.active === 'true',
        limit: query.data.limit,
      });
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/:sosId/acknowledge',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res) => {
      const context = makeContext(req, res);
      const response = await sos.acknowledge(context, sosId(req));
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/:sosId/resolve',
    authGuard,
    manageGuard,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({ resolutionNote: z.string().trim().max(500).optional() })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid resolution note'));
        return;
      }

      const context = makeContext(req, res);
      const response = await sos.resolve(context, sosId(req), body.data);
      res.status(200).json({ data: response });
    }),
  );

  return router;
}
