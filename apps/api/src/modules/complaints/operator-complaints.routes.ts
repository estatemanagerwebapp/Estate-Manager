import { Router, type Request } from 'express';
import { z } from 'zod';
import { COMPLAINT_STATUSES } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, routeAuditContext } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorComplaintsService } from './operator-complaints.service.js';

export interface OperatorComplaintsRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  complaints: OperatorComplaintsService;
}

/**
 * Operator complaint routes, mounted at `/complaints`.
 *
 * `GET /` is the staff queue and requires `complaint.read`. Replying and
 * changing status require `complaint.manage`; the service keeps the
 * organization scope and records staff actors.
 */
export function createOperatorComplaintsRouter(options: OperatorComplaintsRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, complaints } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'complaint.read'));
  const manageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'complaint.manage'));

  function complaintId(req: Request): string {
    const value = req.params.complaintId;
    const flat = Array.isArray(value) ? value[0] : value;
    if (
      typeof flat !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flat)
    ) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid complaint id');
    }
    return flat;
  }

  router.get('/', authGuard, readGuard, async (req, res, next) => {
    const query = z
      .object({
        status: z.enum(COMPLAINT_STATUSES).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(req.query ?? {});
    if (!query.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid complaint filter'));
      return;
    }

    const response = await complaints.list(organizationId, {
      status: query.data.status,
      limit: query.data.limit,
    });
    res.status(200).json({ data: response });
  });

  router.post('/:complaintId/reply', authGuard, manageGuard, async (req, res, next) => {
    const body = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body ?? {});
    if (!body.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid reply body'));
      return;
    }

    const context = routeAuditContext(req, res, organizationId);
    const response = await complaints.reply(context, complaintId(req), body.data);
    res.status(201).json({ data: response });
  });

  router.post('/:complaintId/status', authGuard, manageGuard, async (req, res, next) => {
    const body = z.object({ status: z.enum(COMPLAINT_STATUSES) }).safeParse(req.body ?? {});
    if (!body.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid complaint status'));
      return;
    }

    const context = routeAuditContext(req, res, organizationId);
    const response = await complaints.setStatus(context, complaintId(req), body.data.status);
    res.status(200).json({ data: response });
  });

  return router;
}
