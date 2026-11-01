import { Router, type Request } from 'express';
import { z } from 'zod';
import { MESSAGE_THREAD_STATUSES } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requirePermission, routeAuditContext } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import type { OperatorMessagesService } from './operator-messages.service.js';

export interface OperatorMessagesRouteOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  messages: OperatorMessagesService;
}

/**
 * Operator messaging routes, mounted at `/messages`.
 *
 * `GET /` is the staff inbox and requires `message.read`. Replying, marking
 * read and closing/reopening require `message.manage`; the service keeps the
 * organization scope and records staff actors.
 */
export function createOperatorMessagesRouter(options: OperatorMessagesRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId, messages } = options;

  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));
  const readGuard = requirePermission((ctx) => permissions.can(ctx.role, 'message.read'));
  const manageGuard = requirePermission((ctx) => permissions.can(ctx.role, 'message.manage'));

  function threadId(req: Request): string {
    const value = req.params.threadId;
    const flat = Array.isArray(value) ? value[0] : value;
    if (
      typeof flat !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flat)
    ) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid conversation id');
    }
    return flat;
  }

  router.get('/', authGuard, readGuard, async (req, res, next) => {
    const query = z
      .object({
        status: z.enum(MESSAGE_THREAD_STATUSES).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(req.query ?? {});
    if (!query.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid conversation filter'));
      return;
    }

    const response = await messages.list(organizationId, {
      status: query.data.status,
      limit: query.data.limit,
    });
    res.status(200).json({ data: response });
  });

  router.get('/recipients', authGuard, manageGuard, async (_req, res) => {
    const response = await messages.recipients(organizationId);
    res.status(200).json({ data: response });
  });

  router.post('/compose', authGuard, manageGuard, async (req, res, next) => {
    const body = z
      .object({
        mode: z.enum(['DIRECT', 'BROADCAST']),
        recipientUserId: z.string().uuid().optional(),
        estateId: z.string().uuid().optional(),
        subject: z.string().trim().min(1).max(160),
        body: z.string().trim().min(1).max(4000),
      })
      .refine(
        (value) =>
          value.mode === 'DIRECT'
            ? Boolean(value.recipientUserId) && !value.estateId
            : Boolean(value.estateId) && !value.recipientUserId,
        'Choose exactly one recipient appropriate to the message type',
      )
      .safeParse(req.body ?? {});
    if (!body.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid composed message'));
      return;
    }

    const context = routeAuditContext(req, res, organizationId);
    const response = await messages.compose(context, body.data);
    res.status(201).json({ data: response });
  });

  router.post('/:threadId/read', authGuard, manageGuard, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await messages.markRead(context, threadId(req));
    res.status(200).json({ data: response });
  });

  router.post('/:threadId/reply', authGuard, manageGuard, async (req, res, next) => {
    const body = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body ?? {});
    if (!body.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid message body'));
      return;
    }

    const context = routeAuditContext(req, res, organizationId);
    const response = await messages.reply(context, threadId(req), body.data);
    res.status(201).json({ data: response });
  });

  router.post('/:threadId/close', authGuard, manageGuard, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await messages.setStatus(context, threadId(req), 'CLOSED');
    res.status(200).json({ data: response });
  });

  router.post('/:threadId/reopen', authGuard, manageGuard, async (req, res) => {
    const context = routeAuditContext(req, res, organizationId);
    const response = await messages.setStatus(context, threadId(req), 'OPEN');
    res.status(200).json({ data: response });
  });

  return router;
}
