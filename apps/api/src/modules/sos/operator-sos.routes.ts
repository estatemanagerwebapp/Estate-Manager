import { Router, type Request } from 'express';
import { z } from 'zod';
import { SOS_STATUSES } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import {
  requireAuth,
  requirePermission,
  routeAuditContext,
  routeParam,
} from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorSosService } from './operator-sos.service.js';

export interface OperatorSosRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  sos: OperatorSosService;
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

  function sosId(req: Request): string {
    const value = routeParam(req, 'sosId');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid SOS alert id');
    }
    return value;
  }

  router.get('/', authGuard, readGuard, async (req, res, next) => {
    const query = z
      .object({
        status: z.enum(SOS_STATUSES).optional(),
        active: z.enum(['true', 'false']).optional(),
        estateId: z.string().trim().min(1).max(64).optional(),
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
      estateId: query.data.estateId,
      limit: query.data.limit,
    });
    res.status(200).json({ data: response });
  });

  router.post('/:sosId/acknowledge', authGuard, manageGuard, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await sos.acknowledge(context, sosId(req));
    res.status(200).json({ data: response });
  });

  router.post('/:sosId/resolve', authGuard, manageGuard, async (req, res, next) => {
    const body = z
      .object({ resolutionNote: z.string().trim().max(500).optional() })
      .safeParse(req.body ?? {});
    if (!body.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid resolution note'));
      return;
    }

    const context = routeAuditContext(req, res, organizationId);
    const response = await sos.resolve(context, sosId(req), body.data);
    res.status(200).json({ data: response });
  });

  return router;
}
